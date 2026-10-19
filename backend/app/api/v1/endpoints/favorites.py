from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_client, get_db
from app.crud import favorite as crud_favorite
from app.crud import part as crud_part
from app.models.client import Client
from app.schemas.favorite import FavoritesResponse
from app.schemas.part import build_part_out

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.get("", response_model=FavoritesResponse)
def list_favorites(db: Session = Depends(get_db), client: Client = Depends(get_current_client)):
    parts = crud_favorite.list_favorite_parts(db, client.user_id)
    return {"parts": [build_part_out(part) for part in parts]}


@router.put("/{part_id}", status_code=status.HTTP_204_NO_CONTENT)
def add_favorite(part_id: int, db: Session = Depends(get_db), client: Client = Depends(get_current_client)):
    if crud_part.get_part(db, part_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repuesto no encontrado.")
    crud_favorite.add_favorite(db, client.user_id, part_id)


@router.delete("/{part_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite(part_id: int, db: Session = Depends(get_db), client: Client = Depends(get_current_client)):
    crud_favorite.remove_favorite(db, client.user_id, part_id)
