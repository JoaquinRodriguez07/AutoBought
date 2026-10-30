from fastapi import APIRouter

from app.api.v1.endpoints import auth, brands, parts, models, years, cart, shipping_address, orders, pagos
from app.api.v1.endpoints import favorites, recommendations, stock_alerts, analytics, asistente, tareas

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(brands.router)
api_router.include_router(parts.router)
api_router.include_router(models.router)
api_router.include_router(years.router)
api_router.include_router(cart.router)
api_router.include_router(shipping_address.router)
api_router.include_router(orders.router)
api_router.include_router(pagos.router)
api_router.include_router(recommendations.router)
api_router.include_router(favorites.router)
api_router.include_router(stock_alerts.router)
api_router.include_router(analytics.router)
api_router.include_router(asistente.router)
api_router.include_router(tareas.router)
