"""Cliente de Mercado Pago (Checkout Pro).

Es el único lugar del backend que habla con Mercado Pago: crear el link de
pago de un pedido (preferencia), consultar un pago y devolverlo cuando el
vendedor cancela un pedido pagado. La
tarjeta se carga en la página de Mercado Pago: nunca pasa por la tienda.
En los tests se reemplaza por un cliente falso (ver `get_cliente_mp`): el CI
nunca llama a Mercado Pago.
"""

import hashlib
import hmac
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core import config
from app.core.config import (
    MERCADOPAGO_ACCESS_TOKEN,
    MERCADOPAGO_API_URL,
    MERCADOPAGO_TIMEOUT_SECONDS,
    MERCADOPAGO_WEBHOOK_SECRET,
)


class MercadoPagoUnavailable(Exception):
    """Falta el token, Mercado Pago no respondió a tiempo o devolvió un error."""


@dataclass
class MPPayment:
    """Lo que importa de un pago consultado a Mercado Pago."""

    id: str
    # approved, rejected, cancelled, pending, in_process, refunded...
    state: str
    # El número de pedido que se mandó al crear la preferencia.
    reference: str | None
    # Lo que se cobró (transaction_amount). Se compara con el total del pedido.
    charged_amount: float | None = None


class MercadoPagoClient(Protocol):
    def create_preference(self, preference: dict) -> tuple[str, str]: ...

    def get_payment(self, payment_id_value: str) -> MPPayment: ...

    def get_preference(self, preference_id: str) -> str: ...

    def refund_payment(self, payment_id_value: str, idempotency_key: str) -> None: ...


class MercadoPagoHTTPClient:
    def __init__(
        self,
        token: str = MERCADOPAGO_ACCESS_TOKEN,
        timeout: float = MERCADOPAGO_TIMEOUT_SECONDS,
        transport: httpx.BaseTransport | None = None,
        url: str = MERCADOPAGO_API_URL,
    ):
        self.token = token
        self.timeout = timeout
        self.url = url
        # Solo para los tests: un transporte falso en vez de la red.
        self.transport = transport

    def _request(self, metodo: str, ruta: str, headers: dict | None = None, **kwargs) -> dict:
        if not self.token:
            raise MercadoPagoUnavailable("No hay token de Mercado Pago configurado.")
        try:
            with httpx.Client(timeout=self.timeout, transport=self.transport) as http:
                reply = http.request(
                    metodo,
                    f"{self.url}{ruta}",
                    headers={**(headers or {}), "Authorization": f"Bearer {self.token}"},
                    **kwargs,
                )
        except httpx.HTTPError as error:
            raise MercadoPagoUnavailable(f"Mercado Pago no respondió: {error.__class__.__name__}.") from error

        if reply.status_code not in (200, 201):
            # El cuerpo dice el motivo (token inválido, dato mal armado...). Nunca trae el token.
            raise MercadoPagoUnavailable(
                f"Mercado Pago respondió con error {reply.status_code}: {reply.text[:300]}"
            )
        try:
            return reply.json()
        except ValueError as error:
            raise MercadoPagoUnavailable("Mercado Pago devolvió algo que no es JSON.") from error

    def _link(self, body_data: dict) -> str:
        # Los tokens viejos de prueba ("TEST-...") pagan en el sandbox; los de
        # las cuentas de prueba actuales, en el link normal.
        link_key = "sandbox_init_point" if self.token.startswith("TEST-") else "init_point"
        link = body_data.get(link_key) or body_data.get("init_point")
        if not body_data.get("id") or not link:
            raise MercadoPagoUnavailable("Mercado Pago no devolvió el link de pago.")
        return link

    def create_preference(self, preference: dict) -> tuple[str, str]:
        """Devuelve (id de la preferencia, link de pago)."""
        body_data = self._request("POST", "/checkout/preferences", json=preference)
        link = self._link(body_data)
        return str(body_data["id"]), link

    def get_preference(self, preference_id: str) -> str:
        """Devuelve el link de pago de una preferencia ya creada."""
        return self._link(self._request("GET", f"/checkout/preferences/{preference_id}"))

    def get_payment(self, payment_id_value: str) -> MPPayment:
        body_data = self._request("GET", f"/v1/payments/{payment_id_value}")
        return MPPayment(
            id=str(body_data.get("id", payment_id_value)),
            state=body_data.get("status") or "",
            reference=body_data.get("external_reference"),
            charged_amount=body_data.get("transaction_amount"),
        )

    def refund_payment(self, payment_id_value: str, idempotency_key: str) -> None:
        """Devuelve el total de un pago aprobado. Con la misma clave de
        idempotencia, Mercado Pago no lo devuelve dos veces aunque se
        reintente (por ejemplo, si se cortó la conexión antes de la respuesta)."""
        self._request(
            "POST",
            f"/v1/payments/{payment_id_value}/refunds",
            headers={"X-Idempotency-Key": idempotency_key},
            json={},
        )


def valid_signature(
    signature: str | None,
    request_id: str | None,
    data_id: str,
    secreto: str | None = None,
) -> bool:
    """Comprueba la firma (header x-signature) de un aviso de Mercado Pago.

    El header trae `ts=<hora>,v1=<hash>`, y el hash es un HMAC-SHA256, con
    la clave secreta de los webhooks, de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
    Sin clave configurada no se puede comprobar y se acepta: igual, el estado
    nunca se toma del aviso, sino de consultar el pago a Mercado Pago.
    """
    if secreto is None:
        secreto = MERCADOPAGO_WEBHOOK_SECRET
    if not secreto:
        return True
    if not signature:
        return False

    parts_list = dict(
        part_text.strip().split("=", 1) for part_text in signature.split(",") if "=" in part_text
    )
    ts, received_hash = parts_list.get("ts"), parts_list.get("v1")
    if not ts or not received_hash:
        return False

    manifiesto = f"id:{data_id.lower()};"
    if request_id:
        manifiesto += f"request-id:{request_id};"
    manifiesto += f"ts:{ts};"
    expected_value = hmac.new(secreto.encode(), manifiesto.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected_value, received_hash)


def mercadopago_configurado() -> bool:
    """Si hay token para cobrar. Sin token no se puede crear el link de pago,
    así que tampoco se acepta el pedido."""
    return bool(config.MERCADOPAGO_ACCESS_TOKEN)


def get_mp_client() -> MercadoPagoClient:
    """Dependencia de FastAPI. Los tests la reemplazan por un cliente falso
    con `app.dependency_overrides`."""
    return MercadoPagoHTTPClient()
