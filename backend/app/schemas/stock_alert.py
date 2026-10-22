from pydantic import BaseModel


class StockAlertsOut(BaseModel):
    """Repuestos de los que el cliente pidió aviso cuando vuelva el stock."""

    part_ids: list[int]
