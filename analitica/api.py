"""Cliente de la API de AutoBought para el dashboard.

El dashboard no lee la base: pide todo a los endpoints /analytics del
backend con el token del vendedor, así el control de acceso es el mismo
que el de la tienda (401 sin sesión, 403 si la cuenta no es de vendedor).
"""

import os

import requests

API_URL = os.environ.get("AUTOBOUGHT_API_URL", "http://127.0.0.1:8000").rstrip("/")
TIMEOUT = 15


class CredencialesInvalidas(Exception):
    """El correo o la contraseña no son correctos."""


class SesionVencida(Exception):
    """El token falta, es inválido o venció (401)."""


class SinPermiso(Exception):
    """El token es válido pero la cuenta no es de vendedor (403)."""


class ApiError(Exception):
    """El backend no respondió o respondió con un error inesperado."""


def _detalle(response: requests.Response) -> str:
    # Los 422 traen una lista de errores de validación: no sirve mostrarla.
    try:
        detalle = response.json().get("detail")
    except ValueError:
        detalle = None
    return detalle if isinstance(detalle, str) else f"Error {response.status_code} del backend."


def login(email: str, password: str) -> str:
    """Devuelve el token del usuario, sea cliente o vendedor."""
    try:
        response = requests.post(
            f"{API_URL}/api/v1/auth/login",
            json={"email": email, "password": password},
            timeout=TIMEOUT,
        )
    except requests.RequestException as error:
        raise ApiError(f"No se pudo conectar con el backend ({API_URL}).") from error

    if response.status_code in (401, 422):
        raise CredencialesInvalidas("Correo electrónico o contraseña incorrectos.")
    if not response.ok:
        raise ApiError(_detalle(response))
    return response.json()["access_token"]


def _get(path: str, token: str, params: dict | None = None) -> dict:
    try:
        response = requests.get(
            f"{API_URL}/api/v1/analytics{path}",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT,
        )
    except requests.RequestException as error:
        raise ApiError(f"No se pudo conectar con el backend ({API_URL}).") from error

    if response.status_code == 401:
        raise SesionVencida(_detalle(response))
    if response.status_code == 403:
        raise SinPermiso(_detalle(response))
    if not response.ok:
        raise ApiError(_detalle(response))
    return response.json()


def verificar_vendedor(token: str) -> None:
    """SinPermiso si el token no es de un vendedor."""
    _get("/ping", token)


def stock(token: str, umbral_stock_bajo: int) -> dict:
    return _get("/stock", token, {"low_stock_threshold": umbral_stock_bajo})


def mas_vendidos(token: str, limite: int, dias: int | None) -> dict:
    params = {"limit": limite}
    if dias is not None:
        params["days"] = dias
    return _get("/best-sellers", token, params)


def evolucion_ventas(token: str, meses: int, categoria: str | None) -> dict:
    params = {"months": meses}
    if categoria is not None:
        params["category"] = categoria
    return _get("/sales-evolution", token, params)
