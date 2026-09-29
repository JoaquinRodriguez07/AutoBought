from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.car_model import CarModel
from app.models.compatibility import Compatibility


def list_brands_with_models(db: Session) -> list[dict]:
    query = (
        select(CarModel.brand, CarModel.model)
        .distinct()
        .order_by(CarModel.brand, CarModel.model)
    )

    brands: dict[str, list[str]] = {}

    for brand, model in db.execute(query):
        brands.setdefault(brand, [])

        if model not in brands[brand]:
            brands[brand].append(model)

    return [
        {"brand": brand, "models": models}
        for brand, models in brands.items()
    ]


def list_models_by_brand(db: Session, brand: str) -> list[str]:
    query = (
        select(CarModel.model)
        .where(CarModel.brand == brand)
        .distinct()
        .order_by(CarModel.model)
    )

    return [model for (model,) in db.execute(query)]

def list_years_by_model(
    db: Session,
    brand: str,
    model: str,
) -> list[int]:

    query = (
        select(
            Compatibility.year_from,
            Compatibility.year_to,
        )
        .join(CarModel)
        .where(
            CarModel.brand == brand,
            CarModel.model == model,
        )
    )

    years = set()

    for year_from, year_to in db.execute(query):
        for year in range(year_from, year_to + 1):
            years.add(year)

    return sorted(years)