"""Cliente de Mercado Pago (Checkout Pro).

Es el único lugar del backend que habla con Mercado Pago, con dos llamadas:
crear el link de pago de un pedido (preferencia) y consultar un pago. La
tarjeta se carga en la página de Mercado Pago: nunca pasa por la tienda.
En los tests se reemplaza por un cliente falso (ver `get_cliente_mp`): el CI
nunca llama a Mercado Pago.
"""

import hashlib
import hmac
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import (
    MERCADOPAGO_ACCESS_TOKEN,
    MERCADOPAGO_API_URL,
    MERCADOPAGO_TIMEOUT_SEGUNDOS,
    MERCADOPAGO_WEBHOOK_SECRET,
)


class MercadoPagoNoDisponible(Exception):
    """Falta el token, Mercado Pago no respondió a tiempo o devolvió un error."""


@dataclass
class PagoMP:
    """Lo que importa de un pago consultado a Mercado Pago."""

    id: str
    # approved, rejected, cancelled, pending, in_process, refunded...
    estado: str
    # El número de pedido que se mandó al crear la preferencia.
    referencia: str | None


class ClienteMercadoPago(Protocol):
    def crear_preferencia(self, preferencia: dict) -> tuple[str, str]: ...

    def consultar_pago(self, pago_id: str) -> PagoMP: ...


class ClienteMercadoPagoHTTP:
    def __init__(
        self,
        token: str = MERCADOPAGO_ACCESS_TOKEN,
        timeout: float = MERCADOPAGO_TIMEOUT_SEGUNDOS,
        transport: httpx.BaseTransport | None = None,
        url: str = MERCADOPAGO_API_URL,
    ):
        self.token = token
        self.timeout = timeout
        self.url = url
        # Solo para los tests: un transporte falso en vez de la red.
        self.transport = transport

    def _pedir(self, metodo: str, ruta: str, **kwargs) -> dict:
        if not self.token:
            raise MercadoPagoNoDisponible("No hay token de Mercado Pago configurado.")
        try:
            with httpx.Client(timeout=self.timeout, transport=self.transport) as http:
                respuesta = http.request(
                    metodo,
                    f"{self.url}{ruta}",
                    headers={"Authorization": f"Bearer {self.token}"},
                    **kwargs,
                )
        except httpx.HTTPError as error:
            raise MercadoPagoNoDisponible(f"Mercado Pago no respondió: {error.__class__.__name__}.") from error

        if respuesta.status_code not in (200, 201):
            # El cuerpo dice el motivo (token inválido, dato mal armado...). Nunca trae el token.
            raise MercadoPagoNoDisponible(
                f"Mercado Pago respondió con error {respuesta.status_code}: {respuesta.text[:300]}"
            )
        try:
            return respuesta.json()
        except ValueError as error:
            raise MercadoPagoNoDisponible("Mercado Pago devolvió algo que no es JSON.") from error

    def crear_preferencia(self, preferencia: dict) -> tuple[str, str]:
        """Devuelve (id de la preferencia, link de pago)."""
        cuerpo = self._pedir("POST", "/checkout/preferences", json=preferencia)
        # Los tokens viejos de prueba ("TEST-...") pagan en el sandbox; los de
        # las cuentas de prueba actuales, en el link normal.
        clave_link = "sandbox_init_point" if self.token.startswith("TEST-") else "init_point"
        link = cuerpo.get(clave_link) or cuerpo.get("init_point")
        if not cuerpo.get("id") or not link:
            raise MercadoPagoNoDisponible("Mercado Pago no devolvió el link de pago.")
        return str(cuerpo["id"]), link

    def consultar_pago(self, pago_id: str) -> PagoMP:
        cuerpo = self._pedir("GET", f"/v1/payments/{pago_id}")
        return PagoMP(
            id=str(cuerpo.get("id", pago_id)),
            estado=cuerpo.get("status") or "",
            referencia=cuerpo.get("external_reference"),
        )


def firma_valida(
    firma: str | None,
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
    if not firma:
        return False

    partes = dict(
        parte.strip().split("=", 1) for parte in firma.split(",") if "=" in parte
    )
    ts, hash_recibido = partes.get("ts"), partes.get("v1")
    if not ts or not hash_recibido:
        return False

    manifiesto = f"id:{data_id.lower()};"
    if request_id:
        manifiesto += f"request-id:{request_id};"
    manifiesto += f"ts:{ts};"
    esperado = hmac.new(secreto.encode(), manifiesto.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperado, hash_recibido)


def get_cliente_mp() -> ClienteMercadoPago:
    """Dependencia de FastAPI. Los tests la reemplazan por un cliente falso
    con `app.dependency_overrides`."""
    return ClienteMercadoPagoHTTP()
