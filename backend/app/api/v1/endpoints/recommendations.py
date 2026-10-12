from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud import recommendation as crud_recommendation
from app.schemas.part import build_part_out
from app.schemas.recommendation import RecommendationsResponse


router = APIRouter(prefix="/recommendations", tags=["recommendations"])


# Un carrito real tiene pocos repuestos distintos; el tope evita que una
# consulta con miles de ids dispare miles de queries.
MAX_PART_IDS = 50


def parse_part_ids(raw: str) -> list[int]:
    """Convierte "1,5" en [1, 5], sin repetidos y respetando el orden."""
    part_ids = []
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        # isascii: isdigit solo también acepta "²" o "１", que int() no
        # convierte o convierte de forma inesperada.
        if not (chunk.isascii() and chunk.isdigit()):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="part_ids debe ser una lista de ids numéricos separados por coma.",
            )
        part_ids.append(int(chunk))
    part_ids = list(dict.fromkeys(part_ids))

    if not part_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="part_ids debe incluir al menos un id.",
        )
    if len(part_ids) > MAX_PART_IDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"part_ids admite como máximo {MAX_PART_IDS} ids.",
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
