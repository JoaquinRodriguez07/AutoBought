from fastapi import APIRouter

from app.api.v1.endpoints import auth, brands, parts, models, years, cart

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(brands.router)
api_router.include_router(parts.router)
api_router.include_router(models.router)
api_router.include_router(years.router)
api_router.include_router(cart.router)
