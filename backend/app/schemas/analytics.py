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
