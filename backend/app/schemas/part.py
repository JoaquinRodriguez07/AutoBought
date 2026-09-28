from typing import Optional

from pydantic import BaseModel

from app.models.part import Part


class PartOut(BaseModel):
    id: int
    name: str
    compatible_brands: list[str]
    compatible_models: list[str]
    year_from: Optional[int]
    year_to: Optional[int]
    engine_code: Optional[str]
    part_code: str
    category: str
    color: Optional[str]
    price: int
    stock: int


class PartsResponse(BaseModel):
    parts: list[PartOut]


class CategoryOut(BaseModel):
    name: str
    count: int


class CategoriesResponse(BaseModel):
    categories: list[CategoryOut]


def build_part_out(part: Part) -> PartOut:
    brands = []
    models = []
    engines = set()
    years_from = []
    years_to = []

    for compatibility in part.compatibilities:
        car_model = compatibility.car_model
        if car_model.brand not in brands:
            brands.append(car_model.brand)
        if car_model.model not in models:
            models.append(car_model.model)
        engines.add(car_model.engine_code)
        years_from.append(compatibility.year_from)
        years_to.append(compatibility.year_to)

    engine_code = engines.pop() if len(engines) == 1 else None

    return PartOut(
        id=part.id,
        name=part.name,
        compatible_brands=brands,
        compatible_models=models,
        year_from=min(years_from) if years_from else None,
        year_to=max(years_to) if years_to else None,
        engine_code=engine_code,
        part_code=part.part_code,
        category=part.category,
        color=part.color,
        price=part.price,
        stock=part.stock,
    )
