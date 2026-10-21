from datetime import date

import pytest

from app.core import validators

HOY = date(2026, 10, 15)
DEPARTAMENTOS = ["Artigas", "Montevideo", "San José", "Paysandú"]


# ---------------------------------------------------------------- personas

@pytest.mark.parametrize("nombre", ["Lucía Gómez", "O'Neill", "María-José Núñez", "D’Agostino Ruiz", "Ana"])
def test_nombres_validos(nombre):
    assert validators.nombre_persona(nombre) == nombre


def test_nombre_junta_espacios_repetidos():
    assert validators.nombre_persona("  Lucía    Gómez ") == "Lucía Gómez"


@pytest.mark.parametrize("nombre", ["123", "Ana 2", "@@@", "Ana_Pérez", "   ", "A", "Ana--Paz"])
def test_nombres_invalidos(nombre):
    with pytest.raises(ValueError):
        validators.nombre_persona(nombre)


@pytest.mark.parametrize("password", ["clave123", "Segura2026", "mi auto 4x4"])
def test_passwords_validas(password):
    assert validators.password_segura(password, "lucia@example.com") == password


@pytest.mark.parametrize(
    "password, mensaje",
    [
        ("clave12", "al menos 8"),
        ("abcdefgh", "una letra y un número"),
        ("12345678", "una letra y un número"),
        ("Password1", "muy común"),
        ("lucia2026", "tu correo"),
        ("ñ" * 37 + "1", "demasiado larga"),
    ],
)
def test_passwords_invalidas(password, mensaje):
    with pytest.raises(ValueError, match=mensaje):
        validators.password_segura(password, "lucia@example.com")


# ---------------------------------------------------------------- direcciones

@pytest.mark.parametrize("numero", ["1234", "1234B", "1234 bis", "12 a", "5"])
def test_numeros_de_puerta_validos(numero):
    assert validators.numero_puerta(numero) == numero


@pytest.mark.parametrize("numero", ["s/n", "SN", "S/N"])
def test_sin_numero_se_guarda_como_s_n(numero):
    assert validators.numero_puerta(numero) == "S/N"


@pytest.mark.parametrize("numero", ["abc", "12-34", "123456", "B12", "  "])
def test_numeros_de_puerta_invalidos(numero):
    with pytest.raises(ValueError):
        validators.numero_puerta(numero)


@pytest.mark.parametrize("calle", ["Av. Italia", "18 de Julio", "Ruta 8", "Bv. Gral. Artigas"])
def test_calles_validas(calle):
    assert validators.calle(calle) == calle


@pytest.mark.parametrize("calle", ["1234", "@@", "  ", "!Italia"])
def test_calles_invalidas(calle):
    with pytest.raises(ValueError):
        validators.calle(calle)


def test_codigo_postal_de_5_digitos():
    assert validators.codigo_postal("11300") == "11300"
    assert validators.codigo_postal("  ") is None
    assert validators.codigo_postal(None) is None
    for invalido in ["1130", "113000", "11A00"]:
        with pytest.raises(ValueError):
            validators.codigo_postal(invalido)


def test_apartamento():
    assert validators.apartamento("Torre 2 - 504") == "Torre 2 - 504"
    assert validators.apartamento("") is None
    with pytest.raises(ValueError):
        validators.apartamento("#@!")


def test_ciudad_que_se_llama_como_otro_departamento_se_rechaza():
    with pytest.raises(ValueError, match="no está en el departamento de Artigas"):
        validators.ciudad_en_departamento("montevideo", "Artigas", DEPARTAMENTOS)
    # Sin tildes ni mayúsculas también.
    with pytest.raises(ValueError):
        validators.ciudad_en_departamento("PAYSANDU", "Artigas", DEPARTAMENTOS)


def test_ciudad_del_mismo_departamento_o_desconocida_se_acepta():
    validators.ciudad_en_departamento("Montevideo", "Montevideo", DEPARTAMENTOS)
    validators.ciudad_en_departamento("Bella Unión", "Artigas", DEPARTAMENTOS)


# ---------------------------------------------------------------- tarjetas

def test_la_tarjeta_vale_hasta_el_ultimo_dia_del_mes():
    assert validators.tarjeta_vencida("10/26", HOY) is False
    assert validators.tarjeta_vencida("09/26", HOY) is True
    assert validators.tarjeta_vencida("01/27", HOY) is False


def test_vencimiento_valido():
    assert validators.vencimiento("10/26", HOY) == "10/26"
    assert validators.vencimiento("12/46", HOY) == "12/46"


@pytest.mark.parametrize(
    "valor, mensaje",
    [("09/26", "vencida"), ("01/20", "vencida"), ("01/47", "demasiado lejano"), ("13/30", "MM/AA")],
)
def test_vencimiento_invalido(valor, mensaje):
    with pytest.raises(ValueError, match=mensaje):
        validators.vencimiento(valor, HOY)
