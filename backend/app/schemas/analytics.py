from typing import Literal

from pydantic import BaseModel


class StockPartOut(BaseModel):
    id: int
    part_code: str
    name: str
    manufacturer: str
    category: str
    stock: int
    # stock <= low_stock_threshold (los agotados también cuentan).
    low_stock: bool


class StockResponse(BaseModel):
    low_stock_threshold: int
    parts: list[StockPartOut]


class BestSellerRow(BaseModel):
    id: int
    part_code: str
    name: str
    manufacturer: str
    category: str
    stock: int
    units_sold: int


class AnalyticsBestSellersResponse(BaseModel):
    # None = se contaron todas las ventas.
    days: int | None
    # Meses calendario contados (el actual incluido); None si no se pidió.
    months: int | None = None
    parts: list[BestSellerRow]


# --- Evolución de ventas y proyección (HU 5.4 y 5.5) ---


class SalesMonth(BaseModel):
    month: str  # "AAAA-MM"
    units: int
    # Unidades por el precio de cada venta (frozen_price), en pesos.
    revenue: int
    # El mes actual: sus ventas son hasta hoy.
    in_progress: bool = False


class ProjectionOut(BaseModel):
    month: str  # "AAAA-MM", el mes siguiente al último de la serie
    units: float


class SalesByMonthResponse(BaseModel):
    months: list[SalesMonth]
    projection: ProjectionOut


class ForecastRow(BaseModel):
    id: int
    part_code: str
    name: str
    manufacturer: str
    category: str
    stock: int
    units_last_12_months: int
    projected_units: float


class DemandForecastResponse(BaseModel):
    month: str
    parts: list[ForecastRow]


# --- Riesgo de agotamiento (HU 5.6 y 5.7) ---

RiskLevel = Literal["high", "medium", "low"]


class RiskThresholds(BaseModel):
    # Menos de `high_below` días: alto; hasta `medium_up_to`: medio.
    high_below: int
    medium_up_to: int


class RiskRow(BaseModel):
    id: int
    part_code: str
    name: str
    manufacturer: str
    category: str
    stock: int
    projected_units: float
    daily_demand: float
    # None = no se proyecta demanda: a ese ritmo el stock no se agota.
    coverage_days: float | None
    risk: RiskLevel


class StockoutRiskResponse(BaseModel):
    month: str
    thresholds: RiskThresholds
    parts: list[RiskRow]


# --- Detalle de un repuesto (HU 5.8) ---


class PartAnalyticsOut(BaseModel):
    id: int
    part_code: str
    name: str
    manufacturer: str
    category: str
    price: int
    stock: int
    low_stock: bool
    # Todas las ventas registradas, sin límite de fecha.
    units_sold: int
    months: list[SalesMonth]
    projection: ProjectionOut
    daily_demand: float
    coverage_days: float | None
    risk: RiskLevel


# --- Vehículos, para el formulario de repuestos (HU 5.10) ---


class CarModelOut(BaseModel):
    id: int
    brand: str
    model: str
    engine_code: str | None


class CarModelsResponse(BaseModel):
    car_models: list[CarModelOut]
