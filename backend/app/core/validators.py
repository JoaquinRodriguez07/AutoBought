"""Reglas de validación de datos que escribe el cliente.

Las mismas reglas (y los mismos mensajes) están en
frontend/src/validaciones.js, para que el formulario avise antes de
enviar. Lo que vale es lo de acá: el frontend se puede saltear.
"""

import re
import unicodedata

_ESPACIOS = re.compile(r"\s+")

# Letras de cualquier idioma (con tildes, ñ, ü), espacios, apóstrofos y guiones.
_PERSON_NAME = re.compile(r"^[^\W\d_]+(?:[ '’\-][^\W\d_]+)*$")
_ALIAS = re.compile(r"^[^\W_][\w .,'’\-]*$")
_CALLE = re.compile(r"^[^\W_][\w .,'’\-º°/]*$")
_CIUDAD = re.compile(r"^[^\W_][\w .'’\-]*$")
_APARTAMENTO = re.compile(r"^[^\W_][\w .\-/]*$")
_NUMERO_PUERTA = re.compile(r"^\d{1,5}(?: ?(?:bis|[a-z]))?$", re.IGNORECASE)
_NO_NUMBER = {"s/n", "sn", "s/nº", "sin numero"}
_CODIGO_POSTAL = re.compile(r"^\d{5}$")

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
    without_accents = unicodedata.normalize("NFKD", value)
    return "".join(c for c in without_accents if not unicodedata.combining(c)).casefold()


def _letter_count(value: str) -> int:
    return sum(1 for c in value if c.isalpha())


def _required(value: str, empty_message: str) -> str:
    value = limpiar(value)
    if not value:
        raise ValueError(empty_message)
    return value


# ---------------------------------------------------------------- personas

def person_name(value: str, field: str = "El nombre") -> str:
    value = _required(value, f"{field} no puede estar vacío.")
    if not _PERSON_NAME.match(value):
        raise ValueError(f"{field} solo puede tener letras, espacios, apóstrofos y guiones.")
    if _letter_count(value) < 2:
        raise ValueError(f"{field} tiene que tener al menos 2 letras.")
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
        user_obj = normalizar(email.split("@")[0])
        if len(user_obj) >= 3 and user_obj in normalizar(value):
            raise ValueError("La contraseña no puede contener tu correo.")
    return value


# ---------------------------------------------------------------- direcciones

def address_alias(value: str) -> str:
    value = _required(value, "Poné un nombre para la dirección (ej: Casa).")
    if not _ALIAS.match(value) or _letter_count(value) < 2:
        raise ValueError("El nombre de la dirección tiene que tener letras (ej: Casa, Trabajo).")
    return value


def street_name(value: str) -> str:
    value = _required(value, "La calle no puede estar vacía.")
    if not _CALLE.match(value) or _letter_count(value) < 2:
        raise ValueError("Ingresá un nombre de calle válido (ej: Av. Italia, 18 de Julio).")
    return value


def door_number(value: str) -> str:
    value = _required(value, "El número de puerta no puede estar vacío.")
    if normalizar(value) in _NO_NUMBER:
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


def city_name(value: str) -> str:
    value = _required(value, "La ciudad no puede estar vacía.")
    if not _CIUDAD.match(value) or _letter_count(value) < 2:
        raise ValueError("Ingresá un nombre de ciudad válido.")
    return value


def postal_code_value(value: str | None) -> str | None:
    if value is None or not limpiar(value):
        return None
    value = limpiar(value)
    if not _CODIGO_POSTAL.match(value):
        raise ValueError("El código postal tiene que tener 5 dígitos.")
    return value


def city_in_department(city_: str, department_name: str, departamentos: list[str]) -> None:
    """Rechaza una ciudad que se llama como otro departamento
    (ej: Montevideo en Artigas). No conoce todas las localidades."""
    name_value = normalizar(city_)
    for other in departamentos:
        if other != department_name and normalizar(other) == name_value:
            raise ValueError(f"{city_} no está en el departamento de {department_name}.")
