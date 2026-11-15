"""Schemas de los años de un modelo."""

from pydantic import BaseModel


class YearsResponse(BaseModel):
    brand: str
    model: str
    years: list[int]