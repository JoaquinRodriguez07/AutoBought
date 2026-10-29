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
    parts: list[BestSellerRow]


class MonthlySalesRow(BaseModel):
    # "AAAA-MM", en hora de Uruguay.
    month: str
    units_sold: int
    # Pesos: cantidad × precio al momento de la venta.
    revenue: int
    # True en el mes actual: todavía no terminó, no se lo puede comparar de
    # igual a igual con los anteriores.
    partial: bool


class SalesEvolutionResponse(BaseModel):
    months: int
    # None = toda la tienda.
    category: str | None
    # Del más viejo al más nuevo; siempre `months` filas.
    points: list[MonthlySalesRow]
