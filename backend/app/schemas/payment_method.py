from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core import validators


class CardType(str, Enum):
    VISA = "Visa"
    MASTERCARD = "Mastercard"
    AMERICAN_EXPRESS = "American Express"
    OCA = "OCA"


class PaymentMethodCreate(BaseModel):
    # `forbid`: si el cliente manda el número completo o el CVV, se rechaza
    # en vez de ignorarlo en silencio. Nunca se almacenan ni se reciben.
    model_config = ConfigDict(extra="forbid")

    card_type: CardType
    holder: str = Field(min_length=1, max_length=120)
    last_four: str = Field(pattern=r"^\d{4}$")
    expiry: str = Field(pattern=r"^(0[1-9]|1[0-2])/\d{2}$")
    is_primary: bool = False

    @field_validator("holder")
    @classmethod
    def titular_valido(cls, value: str) -> str:
        return validators.nombre_persona(value, "El nombre del titular")

    @field_validator("expiry")
    @classmethod
    def vencimiento_valido(cls, value: str) -> str:
        return validators.vencimiento(value)


class PaymentMethodOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    payment_method_id: int
    client_id: int
    card_type: str
    holder: str
    last_four: str
    expiry: str
    is_primary: bool
    is_expired: bool
