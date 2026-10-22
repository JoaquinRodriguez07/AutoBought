from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_db
from app.core import validators
from app.core.config import FRONTEND_URL
from app.core.email import enviar_mail
from app.core.security import (
    DARSE_DE_BAJA,
    RECUPERAR_PASSWORD,
    VERIFICAR_CORREO,
    create_access_token,
    create_purpose_token,
    decode_purpose_token,
    hash_password,
    huella_password,
    verify_password,
)
from app.crud import user as crud_user
from app.models.client import Client
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    Token,
    UnsubscribeRequest,
    VerifyEmailRequest,
)
from app.schemas.user import ClientOut, ClientUpdate, EmailPreferences, PasswordChange

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_EN_USO = "El correo ya está en uso."
ENLACE_INVALIDO = "El enlace no es válido o ya venció. Pedí uno nuevo."
RECUPERACION_PEDIDA = (
    "Si el correo está registrado, te mandamos un enlace para elegir una contraseña nueva."
)

VIGENCIA_VERIFICACION_MINUTOS = 24 * 60
VIGENCIA_RECUPERACION_MINUTOS = 30


def _mandar_verificacion(background_tasks: BackgroundTasks, user: User) -> None:
    token = create_purpose_token(
        str(user.user_id), VERIFICAR_CORREO, VIGENCIA_VERIFICACION_MINUTOS
    )
    background_tasks.add_task(
        enviar_mail,
        user.email,
        "Verificá tu correo en AutoBought",
        "verificar_correo",
        {"nombre": user.name, "enlace": f"{FRONTEND_URL}/verificar-correo?token={token}"},
    )


def _mandar_aviso_password_cambiada(background_tasks: BackgroundTasks, user: User) -> None:
    background_tasks.add_task(
        enviar_mail,
        user.email,
        "Tu contraseña de AutoBought se cambió",
        "password_cambiada",
        {"nombre": user.name, "enlace": f"{FRONTEND_URL}/recuperar-password"},
    )


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
def register(
    data: RegisterRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
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

    _mandar_verificacion(background_tasks, client)

    access_token = create_access_token(
        subject=str(client.user_id),
        extra_claims={"user_type": client.user_type},
    )
    return Token(access_token=access_token)


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
def verify_email(data: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Marca el correo como verificado con el token del mail. No pide
    sesión: el enlace se puede abrir en otro dispositivo. Usar el enlace de
    nuevo no es un error, el correo sigue verificado."""
    payload = decode_purpose_token(data.token, VERIFICAR_CORREO)
    user = _usuario_del_token(db, payload)
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ENLACE_INVALIDO)

    if not user.email_verified:
        crud_user.mark_email_verified(db, user)


@router.post("/verify-email/resend", status_code=status.HTTP_204_NO_CONTENT)
def resend_verification(
    background_tasks: BackgroundTasks,
    client: Client = Depends(get_current_client),
):
    if not client.email_verified:
        _mandar_verificacion(background_tasks, client)


@router.post("/password/forgot", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(
    data: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Responde siempre lo mismo, exista o no el correo, para no revelar
    quién tiene cuenta."""
    user = crud_user.get_user_by_email(db, data.email)
    if user is not None:
        token = create_purpose_token(
            str(user.user_id),
            RECUPERAR_PASSWORD,
            VIGENCIA_RECUPERACION_MINUTOS,
            extra_claims={"pwd": huella_password(user.password)},
        )
        background_tasks.add_task(
            enviar_mail,
            user.email,
            "Recuperá tu contraseña de AutoBought",
            "recuperar_password",
            {"nombre": user.name, "enlace": f"{FRONTEND_URL}/restablecer-password?token={token}"},
        )

    return {"detail": RECUPERACION_PEDIDA}


@router.post("/password/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    data: ResetPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    payload = decode_purpose_token(data.token, RECUPERAR_PASSWORD)
    user = _usuario_del_token(db, payload)
    # Si la contraseña ya cambió (por este enlace o de otra forma), la
    # huella no coincide: así el enlace sirve una sola vez.
    if user is None or payload.get("pwd") != huella_password(user.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ENLACE_INVALIDO)

    try:
        validators.password_segura(data.new_password, user.email)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
        ) from None

    crud_user.update_password(db, user, hash_password(data.new_password))
    # El enlace llegó a su correo: eso también prueba que es suyo.
    if not user.email_verified:
        crud_user.mark_email_verified(db, user)
    _mandar_aviso_password_cambiada(background_tasks, user)


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(data: UnsubscribeRequest, db: Session = Depends(get_db)):
    """Enlace «No quiero recibir estos mails» de los mails comerciales. No
    pide sesión. Para volver a recibirlos, el interruptor del perfil."""
    user = _usuario_del_token(db, decode_purpose_token(data.token, DARSE_DE_BAJA))
    if not isinstance(user, Client):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El enlace no es válido.")
    if user.marketing_emails:
        crud_user.set_marketing_emails(db, user, False)


def _usuario_del_token(db: Session, payload: dict | None) -> User | None:
    if payload is None:
        return None
    try:
        return db.get(User, int(payload["sub"]))
    except (KeyError, TypeError, ValueError):
        return None


@router.post("/refresh", response_model=Token)
def refresh(client: Client = Depends(get_current_client)):
    """Entrega un token nuevo a partir de uno todavía válido.

    El token vigente se valida con la misma dependencia que el resto de los
    endpoints de cliente: 401 si falta, es inválido o ya venció (un token
    vencido NO se puede renovar: hay que volver a iniciar sesión), o si el
    cliente ya no existe. El token nuevo repite los datos del usuario que
    están guardados en la base y vuelve a empezar la vigencia completa.
    """
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
def change_password(
    data: PasswordChange,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
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

    try:
        validators.password_segura(data.new_password, client.email)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
        ) from None

    crud_user.update_password(db, client, hash_password(data.new_password))
    _mandar_aviso_password_cambiada(background_tasks, client)


@router.put("/me/preferences", response_model=ClientOut)
def update_preferences(
    data: EmailPreferences,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    """Interruptor «Ofertas y recordatorios por mail» del perfil."""
    return crud_user.set_marketing_emails(db, client, data.marketing_emails)
