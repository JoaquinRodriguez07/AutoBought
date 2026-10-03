from pydantic import BaseModel, ConfigDict


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
