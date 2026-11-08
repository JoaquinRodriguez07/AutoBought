"""Endpoint con las marcas de autos del catálogo."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud import car_model as crud_car_model
from app.schemas.brand import BrandsResponse

router = APIRouter(prefix="/brands", tags=["brands"])


@router.get("", response_model=BrandsResponse)
def list_brands(db: Session = Depends(get_db)):
    return {"brands": crud_car_model.list_brands_with_models(db)}