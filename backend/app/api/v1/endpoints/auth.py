from functools import lru_cache

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import is_active, get_current_client, get_current_user, get_db
from app.core import validators
from app.core.auth_attempts import clear_failures, is_blocked, can_send_mail, register_failure
from app.core.config import (
    FRONTEND_URL,
    PASSWORD_RESET_LINK_MINUTES,
    EMAIL_VERIFICATION_LINK_MINUTES,
)
from app.core.email import schedule_mail
from app.core.security import (
    UNSUBSCRIBE_PURPOSE,
    RESET_PASSWORD,
    VERIFY_EMAIL,
    create_access_token,
    create_purpose_token,
    decode_purpose_token,
    hash_password,
    password_fingerprint,
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

EMAIL_IN_USE = "El correo ya está en uso."
INVALID_LINK = "El enlace no es válido o ya venció. Pedí uno nuevo."
RECUPERACION_PEDIDA = (
    "Si el correo está registrado, te mandamos un enlace para elegir una contraseña nueva."
)



def _send_verification(background_tasks: BackgroundTasks, user: User) -> None:
    token = create_purpose_token(
        str(user.user_id), VERIFY_EMAIL, EMAIL_VERIFICATION_LINK_MINUTES
    )
    schedule_mail(
        background_tasks,
        user.email,
        "Verificá tu correo en AutoBought",
        "verificar_correo",
        {"nombre": user.name, "enlace": f"{FRONTEND_URL}/verificar-correo?token={token}"},
    )


def _send_password_changed_notice(background_tasks: BackgroundTasks, user: User) -> None:
    schedule_mail(
        background_tasks,
        user.email,
        "Tu contraseña de AutoBought se cambió",
        "password_cambiada",
        {"nombre": user.name, "enlace": f"{FRONTEND_URL}/recuperar-password"},
    )


def _session_token(user: User) -> Token:
    """Token de sesión con el rol, la versión de sesión vigentes y el nombre
    del usuario (el portal del vendedor saluda con él: el vendedor no tiene
    perfil propio como el cliente en /me)."""
    claims = {"user_type": user.user_type, "sv": user.session_version, "name": user.name}
    # El portal muestra la sección "Equipo" solo a los administradores (la
    # API lo vuelve a verificar en cada pedido).
    if getattr(user, "is_admin", False):
        claims["admin"] = True
    access_token = create_access_token(subject=str(user.user_id), extra_claims=claims)
    return Token(access_token=access_token)


@lru_cache(maxsize=1)
def _dummy_hash() -> str:
    return hash_password("contraseña que no es de nadie")


@router.post("/login", response_model=Token)
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    if is_blocked(db, credentials.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos. Probá de nuevo en unos minutos.",
        )

    user = crud_user.get_user_by_email(db, credentials.email)
    # Si el correo no existe se compara igual contra un hash falso: así el
    # login tarda lo mismo y no deja adivinar qué correos tienen cuenta.
    hash_a_comparar = user.password if user else _dummy_hash()

    if not verify_password(credentials.password, hash_a_comparar) or not user:
        register_failure(db, credentials.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo electrónico o contraseña incorrectos.",
        )

    if not is_active(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta de vendedor fue dada de baja. Si es un error, hablá con un administrador.",
        )

    clear_failures(db, user.email)

    return _session_token(user)


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(
    data: RegisterRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    if crud_user.get_user_by_email(db, data.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=EMAIL_IN_USE
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
            status_code=status.HTTP_409_CONFLICT, detail=EMAIL_IN_USE
        )

    _send_verification(background_tasks, client)

    return _session_token(client)


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
def verify_email(data: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Marca el correo como verificado con el token del mail. No pide
    sesión: el enlace se puede abrir en otro dispositivo. Usar el enlace de
    nuevo no es un error, el correo sigue verificado."""
    payload = decode_purpose_token(data.token, VERIFY_EMAIL)
    user = _user_from_token(db, payload)
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_LINK)

    if not user.email_verified:
        crud_user.mark_email_verified(db, user)


@router.post("/verify-email/resend", status_code=status.HTTP_204_NO_CONTENT)
def resend_verification(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    if client.email_verified:
        return
    if not can_send_mail(db, "verificar", client.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Ya te mandamos varios mails. Probá de nuevo en unos minutos.",
        )
    _send_verification(background_tasks, client)


@router.post("/password/forgot", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(
    data: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Responde siempre lo mismo, exista o no el correo y aunque se haya
    llegado al límite de mails, para no revelar quién tiene cuenta."""
    user = crud_user.get_user_by_email(db, data.email)
    # A un vendedor dado de baja no se le manda nada (como si no existiera).
    if user is not None and is_active(user) and can_send_mail(db, "recuperar", user.email):
        token = create_purpose_token(
            str(user.user_id),
            RESET_PASSWORD,
            PASSWORD_RESET_LINK_MINUTES,
            extra_claims={"pwd": password_fingerprint(user.password)},
        )
        schedule_mail(
            background_tasks,
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
    payload = decode_purpose_token(data.token, RESET_PASSWORD)
    user = _user_from_token(db, payload)
    # Si la contraseña ya cambió (por este enlace o de otra forma), la
    # huella no coincide: así el enlace sirve una sola vez.
    if user is None or not is_active(user) or payload.get("pwd") != password_fingerprint(user.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_LINK)

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
    _send_password_changed_notice(background_tasks, user)


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(data: UnsubscribeRequest, db: Session = Depends(get_db)):
    """Enlace «No quiero recibir estos mails» de los mails comerciales. No
    pide sesión. Para volver a recibirlos, el interruptor del perfil."""
    user = _user_from_token(db, decode_purpose_token(data.token, UNSUBSCRIBE_PURPOSE))
    if not isinstance(user, Client):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El enlace no es válido.")
    if user.marketing_emails:
        crud_user.set_marketing_emails(db, user, False)


def _user_from_token(db: Session, payload: dict | None) -> User | None:
    if payload is None:
        return None
    try:
        return db.get(User, int(payload["sub"]))
    except (KeyError, TypeError, ValueError):
        return None


@router.post("/refresh", response_model=Token)
def refresh(user: User = Depends(get_current_user)):
    """Entrega un token nuevo a partir de uno todavía válido.

    Sirve para cualquier rol (cliente o vendedor): el token vigente se valida
    con get_current_user, que da 401 si falta, es inválido o ya venció (un
    token vencido NO se puede renovar: hay que volver a iniciar sesión), o si
    el usuario ya no existe. El token nuevo repite el user_type guardado en la
    base y vuelve a empezar la vigencia completa.
    """
    return _session_token(user)


@router.get("/me", response_model=ClientOut)
def me(client: Client = Depends(get_current_client)):
    """Perfil del cliente dueño del token (nombre, correo y teléfono)."""
    return client


@router.patch("/me", response_model=ClientOut)
def update_me(data: ClientUpdate, db: Session = Depends(get_db), client: Client = Depends(get_current_client)):
    phone = data.phone if "phone" in data.model_fields_set else client.phone
    return crud_user.update_client(db, client, name=data.name, phone=phone)


@router.patch("/me/password", response_model=Token)
def change_password(
    data: PasswordChange,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    if is_blocked(db, client.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos. Probá de nuevo en unos minutos.",
        )

    if not verify_password(data.current_password, client.password):
        register_failure(db, client.email)
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
    clear_failures(db, client.email)
    _send_password_changed_notice(background_tasks, client)
    # Las demás sesiones quedaron invalidadas; este dispositivo sigue con un
    # token de la versión nueva.
    return _session_token(client)


@router.put("/me/preferences", response_model=ClientOut)
def update_preferences(
    data: EmailPreferences,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    """Interruptor «Ofertas y recordatorios por mail» del perfil."""
    return crud_user.set_marketing_emails(db, client, data.marketing_emails)
