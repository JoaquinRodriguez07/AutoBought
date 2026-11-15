"""Endpoints de gestión de la cuenta del usuario autenticado."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_db
from app.core.security import verify_password
from app.crud import user as crud_user
from app.models.client import Client
from app.schemas.user import DeleteAccountRequest

router = APIRouter(prefix="/users", tags=["users"])


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_account(
    data: DeleteAccountRequest,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
):
    if not verify_password(data.password, client.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña es incorrecta.",
        )

    try:
        crud_user.delete_client_account(db, client)
    except crud_user.AccountDeletionBlocked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No podés eliminar tu cuenta mientras tengas pedidos pendientes de entrega. Esperá a que se entreguen o cancelen.",
        ) from None
