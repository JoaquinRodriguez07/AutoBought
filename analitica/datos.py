"""Armado de las tablas del dashboard a partir de las respuestas de la API.

Sin Streamlit: así se puede testear sin levantar la app.
"""

import pandas as pd

SIN_STOCK = "Sin stock"
STOCK_BAJO = "Stock bajo"
NORMAL = "Normal"
ESTADOS = (SIN_STOCK, STOCK_BAJO, NORMAL)

# Filtro de estado de la tabla de stock: opción -> estados que muestra.
FILTROS_ESTADO = {
    "Todos": ESTADOS,
    "Stock bajo y sin stock": (SIN_STOCK, STOCK_BAJO),
    "Solo sin stock": (SIN_STOCK,),
}


def miles(numero: int) -> str:
    """1234567 -> "1.234.567", como se escriben los números en Uruguay."""
    return f"{numero:,}".replace(",", ".")


def estado(stock: int, low_stock: bool) -> str:
    if stock <= 0:
        return SIN_STOCK
    return STOCK_BAJO if low_stock else NORMAL


def tabla_stock(parts: list[dict]) -> pd.DataFrame:
    """Respuesta de /analytics/stock -> una fila por repuesto, con su estado."""
    columnas = ["part_code", "name", "manufacturer", "category", "stock", "low_stock"]
    tabla = pd.DataFrame(parts, columns=columnas)
    tabla["estado"] = [estado(s, bajo) for s, bajo in zip(tabla["stock"], tabla["low_stock"])]
    return tabla


def resumen_stock(tabla: pd.DataFrame) -> dict:
    return {
        "repuestos": len(tabla),
        "unidades": int(tabla["stock"].sum()),
        "stock_bajo": int((tabla["estado"] == STOCK_BAJO).sum()),
        "sin_stock": int((tabla["estado"] == SIN_STOCK).sum()),
    }


def filtrar_stock(
    tabla: pd.DataFrame,
    texto: str = "",
    categorias: list[str] | None = None,
    filtro_estado: str = "Todos",
) -> pd.DataFrame:
    """Busca por nombre, código o fabricante, sin distinguir mayúsculas."""
    filas = tabla["estado"].isin(FILTROS_ESTADO[filtro_estado])

    if categorias:
        filas &= tabla["category"].isin(categorias)

    texto = texto.strip().lower()
    if texto:
        filas &= (
            tabla["name"].str.lower().str.contains(texto, regex=False)
            | tabla["part_code"].str.lower().str.contains(texto, regex=False)
            | tabla["manufacturer"].str.lower().str.contains(texto, regex=False)
        )

    return tabla[filas]


def tabla_mas_vendidos(parts: list[dict], umbral_stock_bajo: int) -> pd.DataFrame:
    """Respuesta de /analytics/best-sellers -> ranking con puesto y estado.

    El nombre solo no alcanza para identificar un repuesto (las pastillas
    Bosch de dos autos distintos se llaman igual), así que el gráfico usa
    nombre y código.
    """
    columnas = ["part_code", "name", "manufacturer", "category", "stock", "units_sold"]
    tabla = pd.DataFrame(parts, columns=columnas)
    tabla.insert(0, "puesto", range(1, len(tabla) + 1))
    tabla["repuesto"] = tabla["name"] + " · " + tabla["part_code"]
    tabla["estado"] = [estado(s, s <= umbral_stock_bajo) for s in tabla["stock"]]
    return tabla
