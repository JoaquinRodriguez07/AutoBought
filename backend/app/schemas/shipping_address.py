from pydantic import BaseModel, ConfigDict, Field
from enum import Enum

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