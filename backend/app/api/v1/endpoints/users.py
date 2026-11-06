from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_db
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
    client_id = client.user_id
    # Authentication queried in this session; close its read transaction so
    # the CRUD operation can lock the client and validate atomically.
    db.rollback()

    try:
        crud_user.delete_client_account(db, client_id, data.password)
    except crud_user.IncorrectAccountPassword:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La contraseña es incorrecta.",
        ) from None
    except crud_user.OngoingOrders:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tenés que esperar a que se entregue tu pedido.",
        ) from None

    return Response(status_code=status.HTTP_204_NO_CONTENT)
