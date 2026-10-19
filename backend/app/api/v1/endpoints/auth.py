from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.crud import user as crud_user
from app.models.client import Client
from app.schemas.auth import LoginRequest, RegisterRequest, Token
from app.schemas.user import ClientOut, ClientUpdate, PasswordChange

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_EN_USO = "El correo ya está en uso."


@router.post("/login", response_model=Token)
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    user = crud_user.get_user_by_email(db, credentials.email)

    if not user or not verify_password(credentials.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo electrónico o contraseña incorrectos.",
        )

    access_token = create_access_token(
        subject=str(user.user_id),
        extra_claims={"user_type": user.user_type},
    )
    return Token(access_token=access_token)


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    if crud_user.get_user_by_email(db, data.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=EMAIL_EN_USO
        )

    try:
        client = crud_user.create_client(
            db,
            name=data.name,
            email=data.email,
            password_hash=hash_password(data.password),
            phone=data.phone,
        )
    except IntegrityError:
        # Dos registros simultáneos con el mismo correo: el chequeo de
        # arriba no alcanza, la restricción UNIQUE es la que decide.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=EMAIL_EN_USO
        )

    access_token = create_access_token(
        subject=str(client.user_id),
        extra_claims={"user_type": client.user_type},
    )
    return Token(access_token=access_token)


@router.get("/me", response_model=ClientOut)
def me(client: Client = Depends(get_current_client)):
    """Perfil del cliente dueño del token (nombre, correo y teléfono)."""
    return client


@router.patch("/me", response_model=ClientOut)
def update_me(data: ClientUpdate, db: Session = Depends(get_db), client: Client = Depends(get_current_client)):
    phone = data.phone if "phone" in data.model_fields_set else client.phone
    return crud_user.update_client(db, client, name=data.name, phone=phone)


@router.patch("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(data: PasswordChange, db: Session = Depends(get_db), client: Client = Depends(get_current_client)):
    if not verify_password(data.current_password, client.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual es incorrecta.",
        )

    if data.new_password == data.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña tiene que ser distinta de la actual.",
        )

    crud_user.update_password(db, client, hash_password(data.new_password))
