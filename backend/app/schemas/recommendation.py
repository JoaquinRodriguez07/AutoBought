from pydantic import BaseModel

from app.schemas.part import PartOut


class RecommendationsResponse(BaseModel):
    # Misma estructura de repuesto que GET /api/v1/parts, para que el
    # frontend reutilice mapearRepuesto (contrato acordado en SCRUM-111).
    parts: list[PartOut]
