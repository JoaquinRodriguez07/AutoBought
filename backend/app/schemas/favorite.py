from pydantic import BaseModel

from app.schemas.part import PartOut


class FavoritesResponse(BaseModel):
    parts: list[PartOut]
