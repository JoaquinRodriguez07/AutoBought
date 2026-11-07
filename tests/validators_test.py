
import pytest

from app.core import validators

DEPARTAMENTOS = ["Artigas", "Montevideo", "San José", "Paysandú"]


# ---------------------------------------------------------------- personas

@pytest.mark.parametrize("name_value", ["Lucía Gómez", "O'Neill", "María-José Núñez", "D’Agostino Ruiz", "Ana"])
def test_nombres_validos(name_value):
    assert validators.person_name(name_value) == name_value


def test_nombre_junta_espacios_repetidos():
    assert validators.person_name("  Lucía    Gómez ") == "Lucía Gómez"


@pytest.mark.parametrize("name_value", ["123", "Ana 2", "@@@", "Ana_Pérez", "   ", "A", "Ana--Paz"])
def test_nombres_invalidos(name_value):
    with pytest.raises(ValueError):
        validators.person_name(name_value)


@pytest.mark.parametrize("password", ["clave123", "Segura2026", "mi auto 4x4"])
def test_passwords_validas(password):
    assert validators.password_segura(password, "lucia@example.com") == password


@pytest.mark.parametrize(
    "password, msg",
    [
        ("clave12", "al menos 8"),
        ("abcdefgh", "una letra y un número"),
        ("12345678", "una letra y un número"),
        ("Password1", "muy común"),
        ("lucia2026", "tu correo"),
        ("ñ" * 37 + "1", "demasiado larga"),
    ],
)
def test_passwords_invalidas(password, msg):
    with pytest.raises(ValueError, match=msg):
        validators.password_segura(password, "lucia@example.com")


# ---------------------------------------------------------------- direcciones

@pytest.mark.parametrize("number_value", ["1234", "1234B", "1234 bis", "12 a", "5"])
def test_numeros_de_puerta_validos(number_value):
    assert validators.door_number(number_value) == number_value


@pytest.mark.parametrize("number_value", ["s/n", "SN", "S/N"])
def test_sin_numero_se_guarda_como_s_n(number_value):
    assert validators.door_number(number_value) == "S/N"


@pytest.mark.parametrize("number_value", ["abc", "12-34", "123456", "B12", "  "])
def test_numeros_de_puerta_invalidos(number_value):
    with pytest.raises(ValueError):
        validators.door_number(number_value)


@pytest.mark.parametrize("street_name", ["Av. Italia", "18 de Julio", "Ruta 8", "Bv. Gral. Artigas"])
def test_calles_validas(street_name):
    assert validators.street_name(street_name) == street_name


@pytest.mark.parametrize("street_name", ["1234", "@@", "  ", "!Italia"])
def test_calles_invalidas(street_name):
    with pytest.raises(ValueError):
        validators.street_name(street_name)


def test_codigo_postal_de_5_digitos():
    assert validators.postal_code_value("11300") == "11300"
    assert validators.postal_code_value("  ") is None
    assert validators.postal_code_value(None) is None
    for invalid in ["1130", "113000", "11A00"]:
        with pytest.raises(ValueError):
            validators.postal_code_value(invalid)


def test_apartamento():
    assert validators.apartamento("Torre 2 - 504") == "Torre 2 - 504"
    assert validators.apartamento("") is None
    with pytest.raises(ValueError):
        validators.apartamento("#@!")


def test_ciudad_que_se_llama_como_otro_departamento_se_rechaza():
    with pytest.raises(ValueError, match="no está en el departamento de Artigas"):
        validators.city_in_department("montevideo", "Artigas", DEPARTAMENTOS)
    # Sin tildes ni mayúsculas también.
    with pytest.raises(ValueError):
        validators.city_in_department("PAYSANDU", "Artigas", DEPARTAMENTOS)


def test_ciudad_del_mismo_departamento_o_desconocida_se_acepta():
    validators.city_in_department("Montevideo", "Montevideo", DEPARTAMENTOS)
    validators.city_in_department("Bella Unión", "Artigas", DEPARTAMENTOS)
