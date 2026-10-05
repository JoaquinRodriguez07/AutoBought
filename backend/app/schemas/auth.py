from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.phone import normalize_uy_phone


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8)
    phone: str | None = Field(default=None, max_length=30)

    @field_validator("phone")
    @classmethod
    def phone_uruguayo(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return normalize_uy_phone(value)

    @field_validator("name")
    @classmethod
    def name_no_vacio(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("El nombre no puede estar vacío.")
        return value

    @field_validator("password")
    @classmethod
    def password_cabe_en_bcrypt(cls, value: str) -> str:
        # bcrypt solo admite 72 bytes (y bcrypt>=5 lanza ValueError si se
        # pasa de ahí): se rechaza con 422 en vez de tirar un 500.
        if len(value.encode("utf-8")) > 72:
            raise ValueError("La contraseña no puede superar los 72 bytes.")
        return value


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
