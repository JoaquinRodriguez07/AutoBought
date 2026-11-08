"""Schemas de las marcas de autos."""

from pydantic import BaseModel


class BrandOut(BaseModel):
    brand: str
    models: list[str]
    

class BrandsResponse(BaseModel):
    brands: list[BrandOut]