from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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


# --- Alta y edición de repuestos desde el dashboard (HU 5.10) ---


class CompatibilityIn(BaseModel):
    car_model_id: int = Field(ge=1)
    year_from: int = Field(ge=1950, le=2100)
    year_to: int = Field(ge=1950, le=2100)

    @model_validator(mode="after")
    def anios_en_orden(self):
        if self.year_to < self.year_from:
            raise ValueError("El año hasta no puede ser anterior al año desde.")
        return self


class PartData(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    part_code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=120)
    manufacturer: str = Field(min_length=1, max_length=60)
    category: str = Field(min_length=1, max_length=60)
    price: int = Field(gt=0, le=100_000_000)
    color: Optional[str] = Field(default=None, max_length=40)
    description: Optional[str] = Field(default=None, max_length=5000)
    warranty_months: Optional[int] = Field(default=None, ge=0, le=240)
    # Sin compatibilidades el repuesto no aparece en el catálogo, que se
    # arma desde los vehículos.
    compatibilities: list[CompatibilityIn] = Field(min_length=1, max_length=200)

    @field_validator("compatibilities")
    @classmethod
    def sin_vehiculos_repetidos(cls, value: list[CompatibilityIn]) -> list[CompatibilityIn]:
        ids = [c.car_model_id for c in value]
        if len(ids) != len(set(ids)):
            raise ValueError("Un vehículo figura más de una vez.")
        return value


class PartCreate(PartData):
    stock: int = Field(ge=0, le=1_000_000)


class PartUpdate(PartData):
    pass


class StockUpdate(BaseModel):
    stock: int = Field(ge=0, le=1_000_000)
