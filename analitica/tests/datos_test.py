import datos


def _repuesto(codigo, stock, low_stock, nombre="Pastillas de freno Bosch", categoria="Frenos", fabricante="Bosch"):
    return {
        "id": 1,
        "part_code": codigo,
        "name": nombre,
        "manufacturer": fabricante,
        "category": categoria,
        "stock": stock,
        "low_stock": low_stock,
    }


def _stock():
    return datos.tabla_stock(
        [
            _repuesto("FRE-001", 0, True),
            _repuesto("FRE-002", 3, True, nombre="Disco de freno Brembo", fabricante="Brembo"),
            _repuesto("MOT-001", 40, False, nombre="Filtro de aceite Mann-Filter", categoria="Motor", fabricante="Mann-Filter"),
        ]
    )


def test_miles_separa_con_punto():
    assert datos.miles(1234567) == "1.234.567"
    assert datos.miles(12) == "12"


def test_estado_distingue_sin_stock_de_stock_bajo():
    assert datos.estado(0, True) == "Sin stock"
    assert datos.estado(4, True) == "Stock bajo"
    assert datos.estado(30, False) == "Normal"


def test_tabla_stock_agrega_el_estado():
    assert list(_stock()["estado"]) == ["Sin stock", "Stock bajo", "Normal"]


def test_tabla_stock_vacia_tiene_las_columnas():
    tabla = datos.tabla_stock([])

    assert tabla.empty
    assert {"name", "stock", "estado"} <= set(tabla.columns)


def test_resumen_stock():
    assert datos.resumen_stock(_stock()) == {"repuestos": 3, "unidades": 43, "stock_bajo": 1, "sin_stock": 1}


def test_filtrar_stock_por_estado():
    assert list(datos.filtrar_stock(_stock(), filtro_estado="Stock bajo y sin stock")["part_code"]) == ["FRE-001", "FRE-002"]
    assert list(datos.filtrar_stock(_stock(), filtro_estado="Solo sin stock")["part_code"]) == ["FRE-001"]


def test_filtrar_stock_por_categoria():
    assert list(datos.filtrar_stock(_stock(), categorias=["Motor"])["part_code"]) == ["MOT-001"]


def test_filtrar_stock_busca_por_nombre_codigo_o_fabricante_sin_mayusculas():
    assert list(datos.filtrar_stock(_stock(), texto="  DISCO ")["part_code"]) == ["FRE-002"]
    assert list(datos.filtrar_stock(_stock(), texto="mot-0")["part_code"]) == ["MOT-001"]
    assert list(datos.filtrar_stock(_stock(), texto="mann")["part_code"]) == ["MOT-001"]


def test_filtrar_stock_combina_filtros():
    filtrada = datos.filtrar_stock(_stock(), texto="freno", categorias=["Frenos"], filtro_estado="Solo sin stock")

    assert list(filtrada["part_code"]) == ["FRE-001"]


def test_tabla_mas_vendidos_numera_y_marca_el_stock():
    tabla = datos.tabla_mas_vendidos(
        [
            {"id": 1, "part_code": "FRE-001", "name": "Pastillas", "manufacturer": "Bosch", "category": "Frenos", "stock": 0, "units_sold": 90},
            {"id": 2, "part_code": "FRE-002", "name": "Pastillas", "manufacturer": "Bosch", "category": "Frenos", "stock": 20, "units_sold": 40},
        ],
        umbral_stock_bajo=5,
    )

    assert list(tabla["puesto"]) == [1, 2]
    # Mismo nombre, distinto repuesto: el gráfico los separa por el código.
    assert list(tabla["repuesto"]) == ["Pastillas · FRE-001", "Pastillas · FRE-002"]
    assert list(tabla["estado"]) == ["Sin stock", "Normal"]
