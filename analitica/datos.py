"""Armado de las tablas del dashboard a partir de las respuestas de la API.

Sin Streamlit: así se puede testear sin levantar la app.
"""

import pandas as pd

SIN_STOCK = "Sin stock"
STOCK_BAJO = "Stock bajo"
NORMAL = "Normal"
ESTADOS = (SIN_STOCK, STOCK_BAJO, NORMAL)

# Filtro de estado de la tabla de stock: opción -> estados que muestra.
FILTROS_ESTADO = {
    "Todos": ESTADOS,
    "Stock bajo y sin stock": (SIN_STOCK, STOCK_BAJO),
    "Solo sin stock": (SIN_STOCK,),
}


def miles(numero: int) -> str:
    """1234567 -> "1.234.567", como se escriben los números en Uruguay."""
    return f"{numero:,}".replace(",", ".")


def estado(stock: int, low_stock: bool) -> str:
    if stock <= 0:
        return SIN_STOCK
    return STOCK_BAJO if low_stock else NORMAL


def tabla_stock(parts: list[dict]) -> pd.DataFrame:
    """Respuesta de /analytics/stock -> una fila por repuesto, con su estado."""
    columnas = ["part_code", "name", "manufacturer", "category", "stock", "low_stock"]
    tabla = pd.DataFrame(parts, columns=columnas)
    tabla["estado"] = [estado(s, bajo) for s, bajo in zip(tabla["stock"], tabla["low_stock"])]
    return tabla


def resumen_stock(tabla: pd.DataFrame) -> dict:
    return {
        "repuestos": len(tabla),
        "unidades": int(tabla["stock"].sum()),
        "stock_bajo": int((tabla["estado"] == STOCK_BAJO).sum()),
        "sin_stock": int((tabla["estado"] == SIN_STOCK).sum()),
    }


def filtrar_stock(
    tabla: pd.DataFrame,
    texto: str = "",
    categorias: list[str] | None = None,
    filtro_estado: str = "Todos",
) -> pd.DataFrame:
    """Busca por nombre, código o fabricante, sin distinguir mayúsculas."""
    filas = tabla["estado"].isin(FILTROS_ESTADO[filtro_estado])

    if categorias:
        filas &= tabla["category"].isin(categorias)

    texto = texto.strip().lower()
    if texto:
        filas &= (
            tabla["name"].str.lower().str.contains(texto, regex=False)
            | tabla["part_code"].str.lower().str.contains(texto, regex=False)
            | tabla["manufacturer"].str.lower().str.contains(texto, regex=False)
        )

    return tabla[filas]


def tabla_mas_vendidos(parts: list[dict], umbral_stock_bajo: int) -> pd.DataFrame:
    """Respuesta de /analytics/best-sellers -> ranking con puesto y estado.

    El nombre solo no alcanza para identificar un repuesto (las pastillas
    Bosch de dos autos distintos se llaman igual), así que el gráfico usa
    nombre y código.
    """
    columnas = ["part_code", "name", "manufacturer", "category", "stock", "units_sold"]
    tabla = pd.DataFrame(parts, columns=columnas)
    tabla.insert(0, "puesto", range(1, len(tabla) + 1))
    tabla["repuesto"] = tabla["name"] + " · " + tabla["part_code"]
    tabla["estado"] = [estado(s, s <= umbral_stock_bajo) for s in tabla["stock"]]
    return tabla


# Cómo se compara cada mes con el anterior en la evolución de ventas.
SUBE = "Sube"
BAJA = "Baja"
IGUAL = "Igual"
SIN_ANTERIOR = "Sin mes anterior"
# El mes actual todavía no terminó: compararlo con uno completo diría "baja"
# casi siempre, sin que haya pasado nada.
EN_CURSO = "Mes en curso"
TENDENCIAS = (SUBE, BAJA, IGUAL, SIN_ANTERIOR, EN_CURSO)

_MESES = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")


def etiqueta_mes(mes: str) -> str:
    """"2026-03" -> "mar 2026"."""
    anio, numero = mes.split("-")
    return f"{_MESES[int(numero) - 1]} {anio}"


def _variacion_texto(valor: int, anterior: int | None, pesos: bool) -> str:
    """Cuánto cambió respecto del mes anterior: "+12 (+8,5 %)"."""
    if anterior is None:
        return "—"
    diferencia = valor - anterior
    if diferencia == 0:
        return "Sin cambios"

    signo = "+" if diferencia > 0 else "-"
    cantidad = f"{signo}{'$' if pesos else ''}{miles(abs(diferencia))}"
    if anterior == 0:
        # No se puede dividir por cero: se dice la diferencia y nada más.
        return f"{cantidad} (el mes anterior no tuvo ventas)"

    porcentaje = f"{signo}{abs(diferencia) / anterior * 100:.1f}".replace(".", ",")
    return f"{cantidad} ({porcentaje} %)"


def _valor_corto(valor: int, pesos: bool) -> str:
    """Para escribir sobre el gráfico: 5309480 -> "$5,3 M" (el monto completo
    pisa la línea). Las unidades y los montos chicos van completos."""
    if pesos and valor >= 1_000_000:
        return f"${valor / 1_000_000:.1f} M".replace(".", ",")
    return ("$" if pesos else "") + miles(valor)


def tabla_evolucion(points: list[dict], metrica: str = "units_sold") -> pd.DataFrame:
    """Respuesta de /analytics/sales-evolution -> una fila por mes.

    `metrica` es "units_sold" o "revenue": la que se grafica y con la que se
    calcula la variación contra el mes anterior.
    """
    pesos = metrica == "revenue"
    tabla = pd.DataFrame(points, columns=["month", "units_sold", "revenue", "partial"])
    tabla.insert(1, "etiqueta", [etiqueta_mes(mes) for mes in tabla["month"]])
    tabla["valor"] = tabla[metrica]
    tabla["valor_texto"] = [("$" if pesos else "") + miles(valor) for valor in tabla["valor"]]
    tabla["valor_corto"] = [_valor_corto(int(valor), pesos) for valor in tabla["valor"]]

    anteriores = [None, *tabla["valor"].iloc[:-1]] if len(tabla) else []
    tabla["variacion"] = [
        None if anterior is None else int(valor - anterior)
        for valor, anterior in zip(tabla["valor"], anteriores)
    ]
    tabla["variacion_texto"] = [
        _variacion_texto(int(valor), anterior, pesos)
        for valor, anterior in zip(tabla["valor"], anteriores)
    ]

    def tendencia(parcial, variacion):
        if parcial:
            return EN_CURSO
        if variacion is None or pd.isna(variacion):
            return SIN_ANTERIOR
        return SUBE if variacion > 0 else BAJA if variacion < 0 else IGUAL

    tabla["tendencia"] = [tendencia(p, v) for p, v in zip(tabla["partial"], tabla["variacion"])]
    return tabla
