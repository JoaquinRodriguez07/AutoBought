"""Reglas de validación de datos que escribe el cliente.

Las mismas reglas (y los mismos mensajes) están en
frontend/src/validaciones.js, para que el formulario avise antes de
enviar. Lo que vale es lo de acá: el frontend se puede saltear.
"""

import re
import unicodedata
from datetime import date

_ESPACIOS = re.compile(r"\s+")

# Letras de cualquier idioma (con tildes, ñ, ü), espacios, apóstrofos y guiones.
_NOMBRE_PERSONA = re.compile(r"^[^\W\d_]+(?:[ '’\-][^\W\d_]+)*$")
_ALIAS = re.compile(r"^[^\W_][\w .,'’\-]*$")
_CALLE = re.compile(r"^[^\W_][\w .,'’\-º°/]*$")
_CIUDAD = re.compile(r"^[^\W_][\w .'’\-]*$")
_APARTAMENTO = re.compile(r"^[^\W_][\w .\-/]*$")
_NUMERO_PUERTA = re.compile(r"^\d{1,5}(?: ?(?:bis|[a-z]))?$", re.IGNORECASE)
_SIN_NUMERO = {"s/n", "sn", "s/nº", "sin numero"}
_CODIGO_POSTAL = re.compile(r"^\d{5}$")
_VENCIMIENTO = re.compile(r"^(0[1-9]|1[0-2])/(\d{2})$")

VENCIMIENTO_MAX_ANIOS = 20
PASSWORD_MIN = 8
PASSWORD_MAX_BYTES = 72  # límite de bcrypt

# Contraseñas que cumplen el largo y la mezcla de letras y números pero
# están en todas las listas de contraseñas filtradas.
_PASSWORDS_COMUNES = {
    "password1", "password123", "passw0rd", "contraseña1", "contrasena1",
    "qwerty123", "qwerty1", "abc12345", "abcd1234", "a1b2c3d4", "1q2w3e4r",
    "asdf1234", "admin123", "welcome1", "iloveyou1", "uruguay1", "uruguay123",
    "peñarol1", "penarol1", "nacional1", "autobought1",
}


def limpiar(value: str) -> str:
    """Saca espacios de los extremos y junta los repetidos."""
    return _ESPACIOS.sub(" ", value).strip()


def normalizar(value: str) -> str:
    """Minúsculas y sin tildes, para comparar textos."""
    sin_tildes = unicodedata.normalize("NFKD", value)
    return "".join(c for c in sin_tildes if not unicodedata.combining(c)).casefold()


def _cantidad_letras(value: str) -> int:
    return sum(1 for c in value if c.isalpha())


def _requerido(value: str, mensaje_vacio: str) -> str:
    value = limpiar(value)
    if not value:
        raise ValueError(mensaje_vacio)
    return value


# ---------------------------------------------------------------- personas

def nombre_persona(value: str, campo: str = "El nombre") -> str:
    value = _requerido(value, f"{campo} no puede estar vacío.")
    if not _NOMBRE_PERSONA.match(value):
        raise ValueError(f"{campo} solo puede tener letras, espacios, apóstrofos y guiones.")
    if _cantidad_letras(value) < 2:
        raise ValueError(f"{campo} tiene que tener al menos 2 letras.")
    return value


def password_segura(value: str, email: str | None = None) -> str:
    if len(value) < PASSWORD_MIN:
        raise ValueError(f"La contraseña tiene que tener al menos {PASSWORD_MIN} caracteres.")
    if len(value.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise ValueError("La contraseña es demasiado larga.")
    if not any(c.isalpha() for c in value) or not any(c.isdigit() for c in value):
        raise ValueError("La contraseña tiene que tener al menos una letra y un número.")
    if normalizar(value) in _PASSWORDS_COMUNES:
        raise ValueError("Esa contraseña es muy común. Elegí otra.")
    if email:
        usuario = normalizar(email.split("@")[0])
        if len(usuario) >= 3 and usuario in normalizar(value):
            raise ValueError("La contraseña no puede contener tu correo.")
    return value


# ---------------------------------------------------------------- direcciones

def alias_direccion(value: str) -> str:
    value = _requerido(value, "Poné un nombre para la dirección (ej: Casa).")
    if not _ALIAS.match(value) or _cantidad_letras(value) < 2:
        raise ValueError("El nombre de la dirección tiene que tener letras (ej: Casa, Trabajo).")
    return value


def calle(value: str) -> str:
    value = _requerido(value, "La calle no puede estar vacía.")
    if not _CALLE.match(value) or _cantidad_letras(value) < 2:
        raise ValueError("Ingresá un nombre de calle válido (ej: Av. Italia, 18 de Julio).")
    return value


def numero_puerta(value: str) -> str:
    value = _requerido(value, "El número de puerta no puede estar vacío.")
    if normalizar(value) in _SIN_NUMERO:
        return "S/N"
    if not _NUMERO_PUERTA.match(value):
        raise ValueError("Ingresá un número de puerta válido (ej: 1234, 1234B, 1234 bis o S/N).")
    return value


def apartamento(value: str | None) -> str | None:
    if value is None or not limpiar(value):
        return None
    value = limpiar(value)
    if not _APARTAMENTO.match(value):
        raise ValueError("Ingresá un apartamento válido (ej: 101, 3B, Torre 2 - 504).")
    return value


def ciudad(value: str) -> str:
    value = _requerido(value, "La ciudad no puede estar vacía.")
    if not _CIUDAD.match(value) or _cantidad_letras(value) < 2:
        raise ValueError("Ingresá un nombre de ciudad válido.")
    return value


def codigo_postal(value: str | None) -> str | None:
    if value is None or not limpiar(value):
        return None
    value = limpiar(value)
    if not _CODIGO_POSTAL.match(value):
        raise ValueError("El código postal tiene que tener 5 dígitos.")
    return value


def ciudad_en_departamento(ciudad_: str, departamento: str, departamentos: list[str]) -> None:
    """Rechaza una ciudad que se llama como otro departamento
    (ej: Montevideo en Artigas). No conoce todas las localidades."""
    nombre = normalizar(ciudad_)
    for otro in departamentos:
        if otro != departamento and normalizar(otro) == nombre:
            raise ValueError(f"{ciudad_} no está en el departamento de {departamento}.")


# ---------------------------------------------------------------- tarjetas

def _fin_de_vencimiento(value: str) -> tuple[int, int]:
    match = _VENCIMIENTO.match(value)
    if not match:
        raise ValueError("El vencimiento tiene que tener el formato MM/AA.")
    return 2000 + int(match.group(2)), int(match.group(1))


def tarjeta_vencida(expiry: str, hoy: date | None = None) -> bool:
    """La tarjeta vale hasta el último día del mes de vencimiento."""
    hoy = hoy or date.today()
    anio, mes = _fin_de_vencimiento(expiry)
    return (anio, mes) < (hoy.year, hoy.month)


def vencimiento(value: str, hoy: date | None = None) -> str:
    hoy = hoy or date.today()
    anio, _ = _fin_de_vencimiento(value)
    if tarjeta_vencida(value, hoy):
        raise ValueError("La tarjeta está vencida.")
    if anio > hoy.year + VENCIMIENTO_MAX_ANIOS:
        raise ValueError("Revisá el vencimiento: es demasiado lejano.")
    return value
