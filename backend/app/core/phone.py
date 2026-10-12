"""Teléfonos de Uruguay.

Se aceptan celulares (09X XXX XXX) y fijos (2XXX XXXX Montevideo,
4XXX XXXX interior), con o sin prefijo +598 / 00598 / 598, y con
espacios, guiones, puntos o paréntesis. Se guardan siempre en formato
internacional: "+598" + 8 dígitos (ej: +59899123456).
"""

import re

MENSAJE_TELEFONO = "Ingresá un teléfono uruguayo válido (ej: 099 123 456)."

_SEPARADORES = re.compile(r"[\s\-.()]")
# Celular: 9 + operadora 1-9 + 6 dígitos. Fijo: 2 (Montevideo) o 4 (interior) + 7.
_NACIONAL = re.compile(r"^(9[1-9]\d{6}|[24]\d{7})$")


def normalize_uy_phone(raw: str) -> str:
    """Devuelve el teléfono en formato +598XXXXXXXX o lanza ValueError."""
    digits = _SEPARADORES.sub("", raw.strip())

    if digits.startswith("+"):
        digits = digits[1:]
        if not digits.startswith("598"):
            raise ValueError(MENSAJE_TELEFONO)
        digits = digits[3:]
    elif digits.startswith("00598"):
        digits = digits[5:]
    elif digits.startswith("598") and len(digits) == 11:
        digits = digits[3:]

    # El 0 inicial de los celulares (099...) no va en formato internacional.
    if digits.startswith("0"):
        digits = digits[1:]

    if not digits.isdigit() or not _NACIONAL.match(digits):
        raise ValueError(MENSAJE_TELEFONO)

    return f"+598{digits}"
