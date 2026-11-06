from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core import validators


class EmployeeCreate(BaseModel):
    """Alta de un vendedor: la contraseña la elige él con el mail."""

    name: str = Field(min_length=1, max_length=120)
    email: EmailStr

    @field_validator("name")
    @classmethod
    def name_valido(cls, value: str) -> str:
        return validators.nombre_persona(value)


class EmployeeOut(BaseModel):
    id: int
    name: str
    email: str
    is_admin: bool


class EmployeeListOut(BaseModel):
    employees: list[EmployeeOut]


def build_employee_out(employee) -> EmployeeOut:
    return EmployeeOut(id=employee.user_id, name=employee.name, email=employee.email, is_admin=employee.is_admin)
