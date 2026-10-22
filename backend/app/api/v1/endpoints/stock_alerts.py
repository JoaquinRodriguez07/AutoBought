from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_db
from app.crud import part as crud_part
from app.crud import stock_alert as crud_stock_alert
from app.models.client import Client
from app.schemas.stock_alert import StockAlertsOut

router = APIRouter(prefix="/stock-alerts", tags=["stock-alerts"])


@router.get("", response_model=StockAlertsOut)
def list_stock_alerts(db: Session = Depends(get_db), client: Client = Depends(get_current_client)):
    return {"part_ids": crud_stock_alert.list_part_ids(db, client.user_id)}


@router.put("/{part_id}", status_code=status.HTTP_204_NO_CONTENT)
def add_stock_alert(part_id: int, db: Session = Depends(get_db), client: Client = Depends(get_current_client)):
    """Pide que le avisen cuando el repuesto vuelva a tener stock. Solo
    para repuestos agotados: si hay stock, se puede comprar ahora."""
    part = crud_part.get_part(db, part_id)
    if part is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repuesto no encontrado.")
    if part.stock > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este repuesto tiene stock: ya lo podés comprar.",
        )
    crud_stock_alert.add_alert(db, client.user_id, part_id)


@router.delete("/{part_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_stock_alert(part_id: int, db: Session = Depends(get_db), client: Client = Depends(get_current_client)):
    crud_stock_alert.remove_alert(db, client.user_id, part_id)
