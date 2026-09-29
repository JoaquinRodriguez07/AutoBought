from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud import car_model as crud_car_model

router = APIRouter(prefix="/models", tags=["models"])


@router.get("")
def list_models(
    brand: str = Query(...),
    db: Session = Depends(get_db),
):
    models = crud_car_model.list_models_by_brand(db, brand)

    return {
        "brand": brand,
        "models": models,
    }