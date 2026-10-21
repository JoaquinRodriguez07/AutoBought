from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

from app.core import validators


class Department(str, Enum):
    ARTIGAS = "Artigas"
    CANELONES = "Canelones"
    CERRO_LARGO = "Cerro Largo"
    COLONIA = "Colonia"
    DURAZNO = "Durazno"
    FLORES = "Flores"
    FLORIDA = "Florida"
    LAVALLEJA = "Lavalleja"
    MALDONADO = "Maldonado"
    MONTEVIDEO = "Montevideo"
    PAYSANDU = "Paysandú"
    RIO_NEGRO = "Río Negro"
    RIVERA = "Rivera"
    ROCHA = "Rocha"
    SALTO = "Salto"
    SAN_JOSE = "San José"
    SORIANO = "Soriano"
    TACUAREMBO = "Tacuarembó"
    TREINTA_Y_TRES = "Treinta y Tres"

class ShippingAddressCreate(BaseModel):
    personal_name: str = Field(min_length=1, max_length=50)
    street: str = Field(min_length=1, max_length=50)
    number: str = Field(min_length=1, max_length=10)
    apartment: str | None = Field(default=None, max_length=10)
    city: str = Field(min_length=1, max_length=50)
    department: Department
    postal_code: str | None = Field(default=None, max_length=10)
    is_primary: bool = False

    @field_validator("personal_name")
    @classmethod
    def alias_valido(cls, value: str) -> str:
        return validators.alias_direccion(value)

    @field_validator("street")
    @classmethod
    def calle_valida(cls, value: str) -> str:
        return validators.calle(value)

    @field_validator("number")
    @classmethod
    def numero_valido(cls, value: str) -> str:
        return validators.numero_puerta(value)

    @field_validator("apartment")
    @classmethod
    def apartamento_valido(cls, value: str | None) -> str | None:
        return validators.apartamento(value)

    @field_validator("city")
    @classmethod
    def ciudad_valida(cls, value: str) -> str:
        return validators.ciudad(value)

    @field_validator("postal_code")
    @classmethod
    def codigo_postal_valido(cls, value: str | None) -> str | None:
        return validators.codigo_postal(value)

    @field_validator("department")
    @classmethod
    def ciudad_del_departamento(cls, value: Department, info: ValidationInfo) -> Department:
        # `city` se declara antes, así que ya está validada (si no falló).
        city = info.data.get("city")
        if city:
            validators.ciudad_en_departamento(city, value.value, [d.value for d in Department])
        return value


class ShippingAddressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    shipping_address_id: int
    client_id: int
    personal_name: str
    street: str
    number: str
    apartment: str | None
    city: str
    department: str
    postal_code: str | None
    is_primary: bool
