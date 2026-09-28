from pydantic import BaseModel


class YearsResponse(BaseModel):
    brand: str
    model: str
    years: list[int]