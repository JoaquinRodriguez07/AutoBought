from fastapi import APIRouter, Depends

from app.api.deps import get_current_employee

# Todas las rutas de este router son solo para vendedores (empleados): la
# dependencia a nivel de router la heredan los endpoints que se agreguen.
router = APIRouter(
    prefix="/analytics",
    tags=["analytics"],
    dependencies=[Depends(get_current_employee)],
)


@router.get("/ping")
def ping():
    # Endpoint mínimo para poder verificar el 401/403 del rol vendedor hasta
    # que SCRUM-25 agregue los endpoints de analítica reales.
    return {"status": "ok"}
