from fastapi import APIRouter

from app.api.v1.endpoints import auth, brands, parts, models, years, cart, shipping_address, payment_method, orders
from app.api.v1.endpoints import recommendations

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(brands.router)
api_router.include_router(parts.router)
api_router.include_router(models.router)
api_router.include_router(years.router)
api_router.include_router(cart.router)
api_router.include_router(shipping_address.router)
api_router.include_router(payment_method.router)
api_router.include_router(orders.router)
api_router.include_router(recommendations.router)
