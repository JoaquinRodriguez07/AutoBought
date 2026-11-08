"""Equipo de vendedores (SCRUM-175): un administrador da de alta y de baja
vendedores sin tocar la base. Todas las rutas son solo para administradores."""

import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.core.config import FRONTEND_URL
from app.core.email import schedule_mail
from app.core.security import RESET_PASSWORD, create_purpose_token, hash_password, password_fingerprint
from app.crud import user as crud_user
from app.models.employee import Employee
from app.schemas.employee import EmployeeCreate, EmployeeListOut, EmployeeOut, build_employee_out

router = APIRouter(prefix="/employees", tags=["employees"], dependencies=[Depends(get_current_admin)])

# Más que los 30 minutos de "olvidé mi contraseña": el vendedor nuevo
# puede no ver el mail enseguida.
WELCOME_LINK_MINUTES = 3 * 24 * 60


def _send_welcome(background_tasks: BackgroundTasks, employee: Employee, admin: Employee) -> None:
    """El mismo enlace que "olvidé mi contraseña" (sirve una sola vez),
    con un texto de bienvenida."""
    token = create_purpose_token(
        str(employee.user_id),
        RESET_PASSWORD,
        WELCOME_LINK_MINUTES,
        extra_claims={"pwd": password_fingerprint(employee.password)},
    )
    schedule_mail(
        background_tasks,
        employee.email,
        "Te sumaron al equipo de AutoBought",
        "bienvenida_vendedor",
        {
            "nombre": employee.name,
            "quien": admin.name,
            "correo": employee.email,
            "enlace": f"{FRONTEND_URL}/restablecer-password?token={token}",
        },
    )


def _password_al_azar() -> str:
    # Nadie la conoce: el vendedor elige la suya con el enlace del mail.
    return hash_password(secrets.token_urlsafe(32))


@router.get("", response_model=EmployeeListOut)
def list_employees(db: Session = Depends(get_db)):
    return {"employees": [build_employee_out(e) for e in crud_user.list_employees(db)]}


@router.post("", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(
    data: EmployeeCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: Employee = Depends(get_current_admin),
):
    existente = crud_user.get_user_by_email(db, data.email)
    if isinstance(existente, Employee) and not existente.active:
        # Alguien que ya estuvo en el equipo: vuelve, con una contraseña nueva.
        employee = crud_user.reactivate_employee(db, existente, name=data.name, password_hash=_password_al_azar())
    elif existente is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya hay una cuenta con ese correo.")
    else:
        try:
            employee = crud_user.create_employee(
                db, name=data.name, email=data.email, password_hash=_password_al_azar()
            )
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya hay una cuenta con ese correo.") from None

    _send_welcome(background_tasks, employee, admin)
    return build_employee_out(employee)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    admin: Employee = Depends(get_current_admin),
):
    if employee_id == admin.user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No podés darte de baja a vos mismo.")

    employee = db.get(Employee, employee_id)
    if employee is None or not employee.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendedor no encontrado.")

    crud_user.deactivate_employee(db, employee)
