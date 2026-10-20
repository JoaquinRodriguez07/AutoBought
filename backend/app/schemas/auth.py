from pydantic import BaseModel, EmailStr, Field, ValidationInfo, field_validator

from app.core import validators
from app.core.phone import normalize_uy_phone


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str
    phone: str = Field(max_length=30)

    @field_validator("phone")
    @classmethod
    def phone_uruguayo(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("El teléfono es obligatorio.")
        return normalize_uy_phone(value)

    @field_validator("name")
    @classmethod
    def name_valido(cls, value: str) -> str:
        return validators.nombre_persona(value)

    @field_validator("password")
    @classmethod
    def password_valida(cls, value: str, info: ValidationInfo) -> str:
        # `email` se declara antes: si es válido, ya está en info.data.
        # Incluye el límite de 72 bytes de bcrypt (con más daría un 500).
        return validators.password_segura(value, info.data.get("email"))


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
