from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud import recommendation as crud_recommendation
from app.schemas.part import build_part_out
from app.schemas.recommendation import RecommendationsResponse


router = APIRouter(prefix="/recommendations", tags=["recommendations"])


def parse_part_ids(raw: str) -> list[int]:
    """Convierte "1,5" en [1, 5], sin repetidos y respetando el orden."""
    part_ids = []
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if not chunk.isdigit():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="part_ids debe ser una lista de ids numéricos separados por coma.",
            )
        part_id = int(chunk)
        if part_id not in part_ids:
            part_ids.append(part_id)

    if not part_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="part_ids debe incluir al menos un id.",
        )
    return part_ids


@router.get(
    "",
    response_model=RecommendationsResponse,
    responses={
        status.HTTP_404_NOT_FOUND: {
            "description": "Algún repuesto de part_ids no existe.",
        },
    },
)
def list_recommendations(
    part_ids: str = Query(
        ...,
        description="Ids de los repuestos del carrito, separados por coma (ej: '1,5').",
    ),
    db: Session = Depends(get_db),
):
    ids = parse_part_ids(part_ids)

    missing = crud_recommendation.find_missing_part_ids(db, ids)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe el repuesto con id {missing[0]}.",
        )

    parts = crud_recommendation.get_recommendations(db, ids)
    return {"parts": [build_part_out(part) for part in parts]}
