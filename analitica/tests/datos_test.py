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


# --- Evolución de ventas ---


def _meses(unidades, parcial_el_ultimo=False):
    """Un punto por mes desde 2026-01, con 1.000 pesos por unidad."""
    return [
        {
            "month": f"2026-{numero:02d}",
            "units_sold": cantidad,
            "revenue": cantidad * 1000,
            "partial": parcial_el_ultimo and numero == len(unidades),
        }
        for numero, cantidad in enumerate(unidades, start=1)
    ]


def test_etiqueta_mes_en_espanol():
    assert datos.etiqueta_mes("2026-03") == "mar 2026"
    assert datos.etiqueta_mes("2025-12") == "dic 2025"


def test_evolucion_marca_si_cada_mes_sube_baja_o_queda_igual():
    tabla = datos.tabla_evolucion(_meses([10, 15, 15, 9]))

    assert list(tabla["tendencia"]) == ["Sin mes anterior", "Sube", "Igual", "Baja"]
    assert list(tabla["variacion"][1:]) == [5, 0, -6]
    assert list(tabla["etiqueta"]) == ["ene 2026", "feb 2026", "mar 2026", "abr 2026"]


def test_evolucion_dice_cuanto_aumento_entre_dos_meses():
    tabla = datos.tabla_evolucion(_meses([10, 15, 15, 9]))

    assert list(tabla["variacion_texto"]) == ["—", "+5 (+50,0 %)", "Sin cambios", "-6 (-40,0 %)"]


def test_evolucion_con_el_mes_anterior_sin_ventas_no_divide_por_cero():
    tabla = datos.tabla_evolucion(_meses([0, 8]))

    assert tabla["variacion_texto"][1] == "+8 (el mes anterior no tuvo ventas)"
    assert tabla["tendencia"][1] == "Sube"


def test_el_mes_en_curso_no_se_compara_con_uno_completo():
    tabla = datos.tabla_evolucion(_meses([10, 15, 3], parcial_el_ultimo=True))

    # Va con su variación, pero sin decir que "bajó": todavía no terminó.
    assert tabla["tendencia"][2] == "Mes en curso"
    assert tabla["variacion_texto"][2] == "-12 (-80,0 %)"


def test_evolucion_en_facturacion_usa_pesos_y_separa_los_miles():
    tabla = datos.tabla_evolucion(_meses([1000, 1500]), metrica="revenue")

    assert list(tabla["valor"]) == [1_000_000, 1_500_000]
    assert list(tabla["valor_texto"]) == ["$1.000.000", "$1.500.000"]
    assert tabla["variacion_texto"][1] == "+$500.000 (+50,0 %)"
    # Sobre el gráfico va en millones, para no pisar la línea.
    assert list(tabla["valor_corto"]) == ["$1,0 M", "$1,5 M"]


def test_valor_corto_deja_completos_las_unidades_y_los_montos_chicos():
    assert datos.tabla_evolucion(_meses([1234]))["valor_corto"][0] == "1.234"
    assert datos.tabla_evolucion(_meses([5]), metrica="revenue")["valor_corto"][0] == "$5.000"


def test_evolucion_sin_meses_devuelve_la_tabla_vacia():
    tabla = datos.tabla_evolucion([])

    assert tabla.empty
    assert {"etiqueta", "valor", "variacion_texto", "tendencia"} <= set(tabla.columns)
