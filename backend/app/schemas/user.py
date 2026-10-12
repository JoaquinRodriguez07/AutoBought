from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.phone import normalize_uy_phone

class UserBase(BaseModel):
    username: str
    name: str
    email: str


class UserCreate(UserBase):
    password: str


class UserOut(UserBase):
    user_id: int


class ClientOut(BaseModel):
    """Perfil del cliente autenticado. Nunca incluye la contraseña."""

    model_config = ConfigDict(from_attributes=True)

    user_id: int
    name: str
    email: str
    phone: str | None = None



class ClientUpdate(BaseModel):

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=30)

    @field_validator("name")
    @classmethod
    def name_no_vacio(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("El nombre no puede estar vacío.")
        return value

    @field_validator("phone")
    @classmethod
    def phone_uruguayo(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return normalize_uy_phone(value)


def _cabe_en_bcrypt(value: str) -> str:
    if len(value.encode("utf-8")) > 72:
        raise ValueError("La contraseña no puede superar los 72 bytes.")
    return value


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)

    @field_validator("current_password", "new_password")
    @classmethod
    def password_cabe_en_bcrypt(cls, value: str) -> str:
        return _cabe_en_bcrypt(value)
