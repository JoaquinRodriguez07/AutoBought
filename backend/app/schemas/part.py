from typing import Optional

from pydantic import BaseModel

from app.models.part import Part


class CompatibilityOut(BaseModel):
    brand: str
    model: str
    engine_code: str
    year_from: int
    year_to: int


class PartOut(BaseModel):
    id: int
    name: str
    manufacturer: str
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
    description: Optional[str] = None
    specifications: list[list[str]] = []
    warranty_months: Optional[int] = None
    warranty_provider: Optional[str] = None
    # Para qué autos es, uno por uno (las listas de arriba no dicen qué
    # modelo es de qué marca ni de qué años).
    compatibilities: list[CompatibilityOut] = []


class SearchEntities(BaseModel):
    part: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    fuel: Optional[str] = None


class PartsResponse(BaseModel):
    parts: list[PartOut]
    entities: Optional[SearchEntities] = None


class BestSellerOut(PartOut):
    units_sold: int


class BestSellersResponse(BaseModel):
    parts: list[BestSellerOut]


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
    compatibilities = []

    for compatibility in part.compatibilities:
        car_model = compatibility.car_model
        if car_model.brand not in brands:
            brands.append(car_model.brand)
        if car_model.model not in models:
            models.append(car_model.model)
        engines.add(car_model.engine_code)
        years_from.append(compatibility.year_from)
        years_to.append(compatibility.year_to)
        compatibilities.append(
            CompatibilityOut(
                brand=car_model.brand,
                model=car_model.model,
                engine_code=car_model.engine_code,
                year_from=compatibility.year_from,
                year_to=compatibility.year_to,
            )
        )

    engine_code = engines.pop() if len(engines) == 1 else None

    return PartOut(
        id=part.id,
        name=part.name,
        manufacturer=part.manufacturer,
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
        description=part.description,
        specifications=part.specifications or [],
        warranty_months=part.warranty_months,
        warranty_provider=part.warranty_provider,
        compatibilities=compatibilities,
    )
