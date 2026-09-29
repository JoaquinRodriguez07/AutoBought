from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud import car_model as crud_car_model
from app.schemas.year import YearsResponse


router = APIRouter(prefix="/years", tags=["years"])


@router.get("", response_model=YearsResponse)
def list_years(
    brand: str = Query(...),
    model: str = Query(...),
    db: Session = Depends(get_db),
):
    years = crud_car_model.list_years_by_model(
        db,
        brand,
        model,
    )

    return {
        "brand": brand,
        "model": model,
        "years": years,
    }