"""Preguntarle al dashboard (HU 6.4): el vendedor pregunta en sus palabras y
la IA responde con los números del dashboard.

La IA nunca ve la base ni escribe SQL. Responde en dos pasos:

1. Elige, de una lista cerrada, qué herramientas usar y con qué parámetros
   (las herramientas son los endpoints de análisis, ver
   app.api.v1.endpoints.ask_dashboard). Cada pedido se valida antes de
   correrlo: una herramienta que no existe o un parámetro inválido rechaza
   la respuesta entera y no se corre nada.
2. El backend corre esas herramientas y la IA redacta la respuesta solo con
   sus resultados. Al vendedor le llega el texto y la tabla que lo sustenta.

Si la pregunta no se puede responder con esos datos, la IA no pide ninguna
herramienta y la respuesta lo dice, sin inventar.
"""

import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError

from app.core import analytics_math
from app.core.config import AI_ASK_TIMEOUT_SECONDS, AI_TIMEOUT_SECONDS
from app.ia.client import AIClient, AIUnavailable
from app.ia.service import extract_json

# Herramientas por pregunta: alcanza para comparar dos o tres cosas y acota
# el tiempo y los tokens.
MAX_TOOL_CALLS = 3
# Filas de cada tabla que ve la IA. El vendedor ve las mismas.
MAX_ROWS = 25
MAX_ANSWER_LENGTH = 800

NO_DATA_ANSWER = (
    "No tengo esa información: solo puedo responder con los datos del dashboard "
    "(ventas, más vendidos, stock, proyección de demanda y riesgo de agotamiento)."
)


class InvalidToolCall(AIUnavailable):
    """La IA pidió una herramienta que no existe o con parámetros inválidos.
    No se corre nada: para el vendedor es lo mismo que una IA que no
    respondió bien."""


@dataclass
class ToolResult:
    """Lo que devuelve una herramienta: la tabla que se le muestra al
    vendedor y, en `extra`, datos que no entran en la tabla (la proyección,
    totales) y que la IA también puede usar."""

    columns: list[str]
    rows: list[list[Any]]
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class Tool:
    name: str
    # Qué hace y qué parámetros acepta, tal como lo lee la IA.
    description: str
    params: type[BaseModel]
    run: Callable[[BaseModel], ToolResult]


@dataclass
class AskResult:
    answer: str
    # La tabla que sustenta la respuesta; None si no se usó ninguna.
    data: ToolResult | None
    tokens: int


class ToolCall(BaseModel):
    nombre: str
    parametros: dict[str, Any] = Field(default_factory=dict)


class AskPlan(BaseModel):
    """Paso 1: qué herramientas correr. Una lista vacía quiere decir que la
    pregunta no se responde con los datos del sistema."""

    model_config = ConfigDict(extra="ignore")

    herramientas: list[ToolCall] = Field(default_factory=list, max_length=MAX_TOOL_CALLS)


class AskReply(BaseModel):
    """Paso 2: la respuesta, y cuál de las tablas la sustenta (su índice)."""

    respuesta: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_ANSWER_LENGTH)]
    datos: int | None = None


PLAN_INSTRUCTIONS = f"""Sos el asistente del dashboard del vendedor de AutoBought, una tienda online de repuestos de auto.
El vendedor hace una pregunta sobre sus ventas o su stock. Tu tarea en este paso es elegir qué herramientas
hay que consultar para responderla. Vas a recibir un JSON con la pregunta, la fecha de hoy, el mes en curso
y las categorías de repuestos que existen.

Herramientas disponibles (nombre: qué devuelve; parámetros, todos opcionales):
{{tools}}

Reglas:
- Usá como máximo {MAX_TOOL_CALLS} herramientas, solo de esta lista y solo con los parámetros indicados.
- Las categorías tienen que ser exactamente una de las recibidas.
- Los meses van como "AAAA-MM". Si la pregunta nombra un mes sin año, es el último que ya empezó
  (por ejemplo, si hoy es 2026-11-08, "julio" es "2026-07" y "diciembre" es "2025-12").
- Si la pregunta no se puede responder con estas herramientas (opiniones de clientes, datos de otras
  tiendas, temas que no son ventas ni stock), devolvé la lista vacía.

Respondé solo con un JSON, sin texto alrededor:
{{{{"herramientas": [{{{{"nombre": "...", "parametros": {{{{...}}}}}}}}]}}}}"""

ANSWER_INSTRUCTIONS = f"""Sos el asistente del dashboard del vendedor de AutoBought, una tienda online de repuestos de auto.
Vas a recibir un JSON con la pregunta del vendedor, la fecha de hoy y los resultados de las herramientas
que se consultaron (cada una con sus columnas, filas y datos extra). Respondé la pregunta.

Reglas:
- Usá solo los números de los resultados. No inventes datos, fechas, repuestos ni categorías.
- Si los resultados no alcanzan para responder, decilo claramente.
- Respuesta breve (de 1 a 3 oraciones, hasta {MAX_ANSWER_LENGTH} caracteres), en español rioplatense, con los
  números que la sustentan (unidades, facturación en pesos, días de cobertura...).
- El mes en curso todavía no terminó: sus ventas son hasta hoy.
- En "datos" poné el índice (desde 0) del resultado que más sustenta la respuesta, o null si ninguno.

Respondé solo con un JSON, sin texto alrededor: {{"respuesta": "...", "datos": 0}}"""


def plan_instructions(tools: dict[str, Tool]) -> str:
    listado = "\n".join(f"- {tool.name}: {tool.description}" for tool in tools.values())
    return PLAN_INSTRUCTIONS.format(tools=listado)


def validate_calls(plan: AskPlan, tools: dict[str, Tool], today_date: date) -> list[tuple[Tool, BaseModel]]:
    """Cada herramienta pedida con sus parámetros ya validados. Los modelos
    de parámetros reciben el día de hoy en el contexto (`today`), para
    validar fechas relativas.

    Raises:
        InvalidToolCall: si alguna no existe o tiene parámetros inválidos.
            En ese caso no se corre ninguna.
    """
    calls = []
    for call in plan.herramientas:
        tool = tools.get(call.nombre)
        if tool is None:
            raise InvalidToolCall(f"La IA pidió una herramienta que no existe: {call.nombre!r}.")
        try:
            params = tool.params.model_validate(call.parametros, context={"today": today_date})
        except ValidationError as error:
            raise InvalidToolCall(f"La IA pidió {call.nombre} con parámetros inválidos: {error.errors()}") from error
        calls.append((tool, params))
    return calls


def _for_ai(tool: Tool, params: BaseModel, result: ToolResult) -> dict:
    return {
        "herramienta": tool.name,
        "parametros": params.model_dump(exclude_none=True),
        "columnas": result.columns,
        "filas": result.rows,
        **({"extra": result.extra} if result.extra else {}),
    }


class _Deadline:
    """El tiempo total de una pregunta, repartido entre las llamadas a la IA."""

    def __init__(self, seconds: float):
        self.end = time.monotonic() + seconds

    def remaining(self) -> float:
        left = self.end - time.monotonic()
        if left <= 0:
            raise AIUnavailable("La respuesta tardó más que el máximo permitido.")
        return min(left, AI_TIMEOUT_SECONDS)


def _ask(ai_client: AIClient, instructions: str, payload: dict, model: type[BaseModel], deadline: _Deadline):
    reply = ai_client.generate(instructions, json.dumps(payload, ensure_ascii=False), timeout=deadline.remaining())
    try:
        return model.model_validate(extract_json(reply.texto)), reply.tokens
    except ValidationError as error:
        raise AIUnavailable("La respuesta de la IA no respeta el formato pedido.") from error


def answer(
    ai_client: AIClient,
    question: str,
    today_date: date,
    categories: list[str],
    tools: dict[str, Tool],
    timeout: float = AI_ASK_TIMEOUT_SECONDS,
) -> AskResult:
    """Responde una pregunta del vendedor con las herramientas del dashboard.

    Args:
        ai_client: el cliente de IA (en los tests, uno falso).
        question: la pregunta, tal como la escribió el vendedor.
        today_date: el día de hoy en Uruguay.
        categories: las categorías de repuestos que existen, para que la
            IA use los nombres exactos.
        tools: las herramientas que puede pedir, por nombre.
        timeout: segundos máximos para toda la respuesta.

    Returns:
        La respuesta, la tabla que la sustenta y los tokens que se usaron.

    Raises:
        AIUnavailable: si la IA no responde a tiempo o no respeta el formato.
        InvalidToolCall: si pide una herramienta o un parámetro inválido.
    """
    deadline = _Deadline(timeout)
    context = {
        "pregunta": question,
        "fecha_de_hoy": today_date.isoformat(),
        "mes_en_curso": analytics_math.month_text((today_date.year, today_date.month)),
    }

    plan, tokens = _ask(ai_client, plan_instructions(tools), {**context, "categorias": categories}, AskPlan, deadline)
    calls = validate_calls(plan, tools, today_date)
    if not calls:
        return AskResult(answer=NO_DATA_ANSWER, data=None, tokens=tokens)

    executed = [(tool, params, tool.run(params)) for tool, params in calls]
    reply, answer_tokens = _ask(
        ai_client,
        ANSWER_INSTRUCTIONS,
        {**context, "resultados": [_for_ai(tool, params, result) for tool, params, result in executed]},
        AskReply,
        deadline,
    )
    # Si la IA no dice cuál usó (o da un índice que no existe), se muestra
    # la primera: el vendedor siempre ve los datos consultados.
    index = reply.datos if reply.datos is not None and 0 <= reply.datos < len(executed) else 0
    return AskResult(answer=reply.respuesta, data=executed[index][2], tokens=tokens + answer_tokens)
