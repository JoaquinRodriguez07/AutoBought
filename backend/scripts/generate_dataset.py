"""Generates the catalog data files.

Usage: python -m scripts.generate_dataset

Writes data/car_models.json and data/parts.json. The catalogs below are the
source of truth: to add a car or a part, edit them here and rerun.

Compatibility rules:
- Engine parts (filters, spark plugs, timing belt, water pump) fit every
  model that shares the same engine code.
- Model-specific parts (brakes, suspension, body) are per model, because
  sharing an engine doesn't mean sharing brake pads.
- Universal parts (oil, coolant, wipers) fit the whole catalog.

Manufacturers: each part comes from several manufacturers, like in a real
store, and each one is a different product (own code, price and stock).
The main manufacturer makes it for every car; the others only for some
(see covers), so for a given car there may be one option or several.
"""

import json
import re
import zlib
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

# brand, model, engine_code, year_from, year_to, segment
CAR_MODELS = [
    ("Chevrolet", "Onix", "1.4 8V", 2013, 2019, "hatchback"),
    ("Chevrolet", "Onix", "1.0 Turbo", 2020, 2024, "hatchback"),
    ("Chevrolet", "Prisma", "1.4 8V", 2013, 2019, "sedan"),
    ("Chevrolet", "Corsa", "1.6 8V", 2000, 2010, "hatchback"),
    ("Chevrolet", "Spin", "1.8 8V", 2013, 2023, "minivan"),
    ("Chevrolet", "Cruze", "1.4 Turbo", 2017, 2024, "sedan"),
    ("Chevrolet", "Tracker", "1.2 Turbo", 2020, 2024, "suv"),
    ("Chevrolet", "S10", "2.8 Duramax", 2012, 2024, "pickup"),
    ("Fiat", "Cronos", "1.3 Firefly", 2018, 2024, "sedan"),
    ("Fiat", "Argo", "1.3 Firefly", 2018, 2024, "hatchback"),
    ("Fiat", "Palio", "1.4 Fire", 2004, 2016, "hatchback"),
    ("Fiat", "Siena", "1.4 Fire", 2004, 2016, "sedan"),
    ("Fiat", "Uno", "1.4 Fire", 2010, 2021, "hatchback"),
    ("Fiat", "Strada", "1.4 Fire", 2009, 2020, "pickup"),
    ("Fiat", "Toro", "2.0 Multijet", 2016, 2024, "pickup"),
    ("Volkswagen", "Gol", "1.6 MSI", 2013, 2023, "hatchback"),
    ("Volkswagen", "Voyage", "1.6 MSI", 2013, 2022, "sedan"),
    ("Volkswagen", "Saveiro", "1.6 MSI", 2010, 2023, "pickup"),
    ("Volkswagen", "Polo", "1.6 MSI", 2018, 2024, "hatchback"),
    ("Volkswagen", "Virtus", "1.6 MSI", 2018, 2024, "sedan"),
    ("Volkswagen", "T-Cross", "1.0 TSI", 2019, 2024, "suv"),
    ("Volkswagen", "Amarok", "2.0 TDI", 2011, 2024, "pickup"),
    ("Ford", "Fiesta", "1.6 Sigma", 2011, 2019, "hatchback"),
    ("Ford", "Focus", "2.0 Duratec", 2009, 2018, "hatchback"),
    ("Ford", "Ka", "1.5 Dragon", 2018, 2023, "hatchback"),
    ("Ford", "EcoSport", "1.5 Dragon", 2018, 2022, "suv"),
    ("Ford", "Ranger", "3.2 Duratorq", 2012, 2022, "pickup"),
    ("Renault", "Sandero", "1.6 K4M", 2012, 2020, "hatchback"),
    ("Renault", "Logan", "1.6 K4M", 2010, 2020, "sedan"),
    ("Renault", "Stepway", "1.6 K4M", 2013, 2020, "suv"),
    ("Renault", "Duster", "1.6 K4M", 2012, 2021, "suv"),
    ("Renault", "Kwid", "1.0 SCe", 2018, 2024, "hatchback"),
    ("Renault", "Kangoo", "1.6 K7M", 2008, 2019, "van"),
    ("Peugeot", "208", "1.6 EC5", 2013, 2021, "hatchback"),
    ("Peugeot", "2008", "1.6 EC5", 2016, 2022, "suv"),
    ("Peugeot", "Partner", "1.6 HDi", 2010, 2020, "van"),
    ("Citroen", "C3", "1.6 EC5", 2013, 2021, "hatchback"),
    ("Citroen", "Berlingo", "1.6 HDi", 2010, 2020, "van"),
    ("Toyota", "Etios", "1.5 2NR", 2013, 2022, "hatchback"),
    ("Toyota", "Yaris", "1.5 2NR", 2018, 2024, "hatchback"),
    ("Toyota", "Corolla", "1.8 2ZR", 2015, 2024, "sedan"),
    ("Toyota", "Hilux", "2.8 1GD", 2016, 2024, "pickup"),
    ("Nissan", "March", "1.6 HR16", 2011, 2020, "hatchback"),
    ("Nissan", "Versa", "1.6 HR16", 2015, 2024, "sedan"),
    ("Nissan", "Kicks", "1.6 HR16", 2017, 2024, "suv"),
    ("Nissan", "Frontier", "2.3 YS23", 2018, 2024, "pickup"),
    ("Hyundai", "HB20", "1.6 Gamma", 2013, 2022, "hatchback"),
    ("Hyundai", "Creta", "1.6 Gamma", 2017, 2024, "suv"),
    ("Kia", "Rio", "1.6 Gamma", 2012, 2020, "hatchback"),
    ("Kia", "Sportage", "2.0 Nu", 2016, 2023, "suv"),
]

# Marcas agregadas después del catálogo original. Sus repuestos se generan
# al final (ver build_parts), para no cambiar los códigos (ni el stock, que
# se calcula del código) de los que ya existían. Lo nuevo va siempre al final
# de esta lista, y sin repetir motores de CAR_MODELS (los repuestos de un
# motor viejo ya tienen sus compatibilidades). Los modelos de Mazda van
# juntos ("Mazda2"): un modelo "2" chocaría con motores como "2.0" en los
# nombres de los repuestos (ver check_parts).
NEW_BRAND_MODELS = [
    ("Suzuki", "Swift", "1.2 K12M", 2018, 2024, "hatchback"),
    ("Suzuki", "Celerio", "1.0 K10B", 2015, 2024, "hatchback"),
    ("Suzuki", "Vitara", "1.6 M16A", 2016, 2024, "suv"),
    ("Chery", "Tiggo 2", "1.5 Acteco", 2017, 2024, "suv"),
    ("Chery", "Tiggo 4", "1.5 TGDI", 2020, 2024, "suv"),
    ("Chery", "Tiggo 7", "1.5 TGDI", 2020, 2024, "suv"),
    # Híbridos: tienen motor a nafta, así que llevan los mismos repuestos.
    ("BYD", "Song Pro DM-i", "1.5 Xiaoyun", 2022, 2024, "suv"),
    ("BYD", "King DM-i", "1.5 Xiaoyun", 2023, 2024, "sedan"),
    ("GAC", "GS3", "1.5 4A15J1", 2021, 2024, "suv"),
    ("GAC", "GS4", "1.5 4A15J1", 2020, 2024, "suv"),
    ("Mercedes-Benz", "Clase A", "1.3 M282", 2019, 2024, "hatchback"),
    ("Mercedes-Benz", "Clase C", "2.0 M264", 2019, 2024, "sedan"),
    ("Mercedes-Benz", "Sprinter", "2.2 OM651", 2012, 2023, "van"),
    ("BMW", "Serie 1", "1.5 B38", 2019, 2024, "hatchback"),
    ("BMW", "X1", "1.5 B38", 2020, 2024, "suv"),
    ("BMW", "Serie 3", "2.0 B48", 2019, 2024, "sedan"),
    ("Audi", "A3", "1.4 TFSI", 2014, 2020, "sedan"),
    ("Audi", "Q3", "1.4 TFSI", 2015, 2020, "suv"),
    ("Geely", "Coolray", "1.5 3G15TD", 2020, 2024, "suv"),
    ("Geely", "Emgrand", "1.5 JL4G15", 2022, 2024, "sedan"),
    ("Mitsubishi", "L200", "2.4 4N15", 2016, 2024, "pickup"),
    ("Mitsubishi", "Outlander", "2.0 4B11", 2015, 2021, "suv"),
    ("Mitsubishi", "ASX", "2.0 4B11", 2013, 2021, "suv"),
    ("Honda", "Fit", "1.5 L15", 2015, 2020, "hatchback"),
    ("Honda", "City", "1.5 L15", 2015, 2022, "sedan"),
    ("Honda", "HR-V", "1.8 R18", 2016, 2022, "suv"),
    ("Honda", "Civic", "2.0 K20C", 2017, 2021, "sedan"),
    ("Jeep", "Renegade", "1.8 E.torQ", 2016, 2021, "suv"),
    ("Jeep", "Compass", "1.3 T270", 2022, 2024, "suv"),
    ("JAC", "S2", "1.5 HFC4GA3", 2016, 2022, "suv"),
    ("JAC", "T8", "2.0 HFC4DA", 2019, 2024, "pickup"),
    ("Mazda", "Mazda2", "1.5 Skyactiv-G", 2015, 2024, "hatchback"),
    ("Mazda", "Mazda3", "2.0 Skyactiv-G", 2014, 2024, "sedan"),
    ("Mazda", "CX-5", "2.0 Skyactiv-G", 2017, 2024, "suv"),
]

SEGMENT_FACTOR = {
    "hatchback": 1.0,
    "sedan": 1.05,
    "van": 1.15,
    "minivan": 1.2,
    "suv": 1.3,
    "pickup": 1.5,
}

# name, category, base price, color
ENGINE_PARTS = [
    ("Filtro de aceite", "Filtros", 750, None),
    ("Filtro de aire", "Filtros", 900, None),
    ("Bujía", "Encendido", 620, None),
    ("Bobina de encendido", "Encendido", 3400, None),
    ("Kit de distribución", "Motor", 8900, None),
    ("Bomba de agua", "Motor", 5200, None),
]

MODEL_PARTS = [
    ("Pastillas de freno delanteras", "Frenos", 2800, None),
    ("Amortiguador delantero", "Suspensión", 6100, None),
    ("Faro delantero", "Carrocería", 6900, "Negro"),
    ("Radiador", "Refrigeración", 8700, None),
]

UNIVERSAL_PARTS = [
    ("Refrigerante 1L", "Refrigeración", 480, "Verde"),
    ("Aceite de motor 5W30 4L", "Lubricantes", 2600, None),
    ("Escobilla limpiaparabrisas", "Accesorios", 890, None),
]

# Repuestos agregados después del catálogo original. Se generan al final
# para no cambiar los códigos (ni el stock, que se calcula del código) de
# los que ya existían. Lo nuevo va siempre al final de estas listas.
EXTRA_ENGINE_PARTS = [
    ("Filtro de combustible", "Filtros", 850, None),
]

EXTRA_MODEL_PARTS = [
    ("Discos de freno delanteros", "Frenos", 3600, None),
]

# Uno por modelo (no por motor): depende de la carrocería.
BODY_PARTS = [
    ("Filtro de habitáculo", "Filtros", 700, None),
]

DIESEL_ENGINES = {
    "1.6 HDi", "2.0 Multijet", "2.0 TDI", "2.3 YS23", "2.8 1GD", "2.8 Duramax", "3.2 Duratorq",
    "2.2 OM651", "2.4 4N15", "2.0 HFC4DA",
}

# name, price (fijo: ya están separadas por tamaño), qué autos la usan
BATTERIES = [
    ("Batería 12V 45Ah", 4500,
     lambda m: m["segment"] == "hatchback" and m["engine_code"] not in DIESEL_ENGINES),
    ("Batería 12V 60Ah", 5600,
     lambda m: m["segment"] in ("sedan", "suv", "minivan", "van")
     and m["engine_code"] not in DIESEL_ENGINES),
    ("Batería 12V 75Ah", 6700,
     lambda m: m["segment"] == "pickup" and m["engine_code"] not in DIESEL_ENGINES),
    ("Batería 12V 90Ah", 8200,
     lambda m: m["engine_code"] in DIESEL_ENGINES),
]

# Fabricantes de cada repuesto (por cómo empieza el nombre), con un factor
# de precio según la gama. El primero es el principal: hace el repuesto para
# todos los autos y se queda con el código que el repuesto tenía antes de
# que hubiera fabricantes. Los demás se generan al final (ver build_parts).
MANUFACTURERS = {
    "Filtro de aceite": [("Mann-Filter", 1.0), ("Bosch", 1.05), ("Fram", 0.85)],
    "Filtro de aire": [("Mann-Filter", 1.0), ("Bosch", 1.05), ("Fram", 0.85)],
    "Filtro de combustible": [("Mann-Filter", 1.0), ("Bosch", 1.05)],
    "Filtro de habitáculo": [("Mann-Filter", 1.0), ("Bosch", 1.05)],
    "Bujía": [("NGK", 1.0), ("Bosch", 1.1), ("Denso", 1.05)],
    "Bobina de encendido": [("Bosch", 1.0), ("Delphi", 0.9), ("NGK", 1.05)],
    "Kit de distribución": [("Gates", 1.0), ("Contitech", 0.95), ("SKF", 1.1)],
    "Bomba de agua": [("SKF", 1.0), ("Gates", 0.95)],
    "Pastillas de freno": [("Bosch", 1.0), ("Brembo", 1.3), ("TRW", 1.1), ("Ferodo", 0.9)],
    "Discos de freno": [("Brembo", 1.0), ("TRW", 0.9), ("Fremax", 0.8)],
    "Amortiguador": [("Monroe", 1.0), ("Sachs", 1.1), ("KYB", 0.95)],
    "Faro": [("Valeo", 1.0), ("Hella", 1.15), ("Depo", 0.75)],
    "Radiador": [("Valeo", 1.0), ("Nissens", 0.95)],
    "Refrigerante": [("Paraflu", 1.0), ("Prestone", 1.2)],
    "Aceite de motor": [("Castrol", 1.0), ("Mobil", 1.05), ("Shell", 0.95)],
    "Escobilla": [("Bosch", 1.0), ("Valeo", 0.95)],
    "Batería": [("Moura", 1.0), ("Bosch", 1.15), ("Willard", 0.9)],
}

# Garantía de cada repuesto, en meses, por tipo (por cómo empieza el
# nombre). La da el fabricante, salvo las marcas económicas de
# VENDOR_WARRANTY: esas no tienen garantía de fábrica en el país y la cubre
# el vendedor (la tienda).
WARRANTY_MONTHS = {
    "Filtro": 6,
    "Bujía": 12,
    "Bobina de encendido": 12,
    "Kit de distribución": 12,
    "Bomba de agua": 12,
    "Pastillas de freno": 6,
    "Discos de freno": 12,
    "Amortiguador": 24,
    "Faro": 12,
    "Radiador": 12,
    "Refrigerante": 6,
    "Aceite de motor": 6,
    "Escobilla": 6,
    "Batería": 18,
}

VENDOR_WARRANTY = {"Fram", "Fremax", "Depo", "Willard"}

# Para qué sirve cada tipo de repuesto: la segunda oración de la
# descripción (la primera dice qué es y para qué autos).
USES = {
    "Filtro de aceite": "Retiene las impurezas del aceite y protege el motor del desgaste. "
                        "Se recomienda cambiarlo junto con el aceite, cada 10.000 km.",
    "Filtro de aire": "Evita que entren polvo y partículas al motor y mantiene el consumo. "
                      "Se recomienda revisarlo cada 10.000 km y cambiarlo cada 20.000 km.",
    "Filtro de combustible": "Retiene la suciedad y el agua del combustible antes de que "
                             "lleguen a los inyectores. Se recomienda cambiarlo cada 20.000 km.",
    "Filtro de habitáculo": "Filtra el aire que entra a la cabina por la ventilación y el aire "
                            "acondicionado. Se recomienda cambiarlo una vez por año.",
    "Bujía": "Genera la chispa que enciende la mezcla en cada cilindro. Unas bujías gastadas "
             "hacen que el motor arranque mal y consuma más.",
    "Bobina de encendido": "Eleva la tensión de la batería para que las bujías den chispa. "
                           "Si falla, el motor tironea o pierde potencia.",
    "Kit de distribución": "Sincroniza el cigüeñal con los árboles de levas. Se cambia completo "
                           "(correa, tensor y polea) cada 60.000 km para evitar roturas del motor.",
    "Bomba de agua": "Hace circular el refrigerante por el motor y el radiador. Se recomienda "
                     "cambiarla junto con el kit de distribución.",
    "Pastillas de freno": "Frenan el auto al apretar contra los discos. Se recomienda revisarlas "
                          "cada 10.000 km y cambiarlas siempre de a pares.",
    "Discos de freno": "Superficie contra la que frenan las pastillas. Se cambian de a pares, "
                       "junto con pastillas nuevas.",
    "Amortiguador": "Mantiene las ruedas apoyadas en el piso y el auto estable en curvas y "
                    "frenadas. Se cambian de a pares.",
    "Faro": "Conjunto óptico completo, listo para instalar. Las lámparas se venden aparte.",
    "Radiador": "Disipa el calor del refrigerante para que el motor no recaliente.",
    "Refrigerante": "Mantiene la temperatura del motor y lo protege de la corrosión. "
                    "Listo para usar, sin diluir.",
    "Aceite de motor": "Lubrica y protege el motor. Alcanza para un cambio completo en la "
                       "mayoría de los motores nafteros chicos y medianos.",
    "Escobilla": "Limpia el parabrisas sin dejar marcas. Se recomienda cambiarla una vez "
                 "por año o cuando empieza a rayar o a dejar agua.",
    "Batería": "Libre de mantenimiento: no hay que agregarle agua. Se entrega cargada y "
               "lista para instalar.",
}

PREFIXES = {
    "Filtros": "FIL",
    "Encendido": "IGN",
    "Motor": "ENG",
    "Frenos": "BRK",
    "Suspensión": "SUS",
    "Carrocería": "BOD",
    "Refrigeración": "COL",
    "Lubricantes": "LUB",
    "Accesorios": "ACC",
    "Eléctrico": "ELE",
}


def build_car_models():
    return [
        {
            "brand": brand,
            "model": model,
            "engine_code": engine_code,
            "year_from": year_from,
            "year_to": year_to,
            "segment": segment,
        }
        for brand, model, engine_code, year_from, year_to, segment in CAR_MODELS + NEW_BRAND_MODELS
    ]


def group_by_engine(car_models):
    groups = {}
    for car_model in car_models:
        groups.setdefault(car_model["engine_code"], []).append(car_model)
    return groups


def group_by_model(car_models):
    groups = {}
    for car_model in car_models:
        groups.setdefault((car_model["brand"], car_model["model"]), []).append(car_model)
    return groups


def calc_price(base_price, compatible_models):
    factor = max(SEGMENT_FACTOR[m["segment"]] for m in compatible_models)
    return int(round(base_price * factor / 10) * 10)


def manufacturers_of(name):
    return next(makers for prefix, makers in MANUFACTURERS.items() if name.startswith(prefix))


def covers(manufacturer, group):
    """Si un fabricante que no es el principal hace el repuesto para un
    grupo de autos (un motor o un modelo): 2 de cada 3 grupos, elegidos
    siempre igual. Sin grupo (universales, baterías) lo hace para todos."""
    return group is None or zlib.crc32(f"{manufacturer}|{group}".encode()) % 3 != 0


def calc_stock(part_code, category):
    seed = sum(ord(ch) for ch in part_code)
    if seed % 17 == 0:
        return 0
    cap = 60 if category in ("Filtros", "Lubricantes", "Accesorios") else 25
    return seed % cap + 1


def by_prefix(table, name):
    return next(value for prefix, value in table.items() if name.startswith(prefix))


def pick(options, key):
    """Una opción elegida siempre igual para la misma clave (como el stock):
    los datos cambian entre repuestos pero no entre corridas."""
    return options[zlib.crc32(key.encode()) % len(options)]


# Qué tan grande es el auto más grande que usa el repuesto: los frenos, la
# suspensión y el radiador de una pickup son más grandes que los de un auto
# chico.
SIZE = {"hatchback": 0, "sedan": 1, "van": 2, "minivan": 2, "suv": 3, "pickup": 4}


def specifications(name, manufacturer, compatible, code):
    """Especificaciones técnicas del repuesto, como pares [nombre, valor]."""
    size = max(SIZE[m["segment"]] for m in compatible)
    diesel = all(m["engine_code"] in DIESEL_ENGINES for m in compatible)
    economy = manufacturer in VENDOR_WARRANTY

    def mm(values):
        return f"{values[min(size, len(values) - 1)]} mm"

    if name.startswith("Filtro de aceite"):
        return [
            ["Rosca", pick(["M20 x 1,5", "3/4\" - 16 UNF", "M22 x 1,5"], code)],
            ["Diámetro exterior", f"{pick([76, 80, 93], code)} mm"],
            ["Altura", f"{pick([65, 79, 86, 100], code)} mm"],
            ["Válvula antirretorno", "Sí"],
            ["Medio filtrante", "Celulosa" if economy else "Fibra sintética"],
        ]
    if name.startswith("Filtro de aire"):
        return [
            ["Forma", pick(["Panel rectangular", "Panel trapezoidal", "Cilíndrico"], code)],
            ["Largo", f"{pick([220, 245, 268, 290], code)} mm"],
            ["Ancho", f"{pick([160, 180, 195], code)} mm"],
            ["Alto", f"{pick([40, 50, 58], code)} mm"],
            ["Material", "Celulosa" if economy else "Celulosa con tratamiento ignífugo"],
        ]
    if name.startswith("Filtro de combustible"):
        return [
            ["Combustible", "Diésel" if diesel else "Nafta"],
            ["Tipo", "Con separador de agua" if diesel else "En línea"],
            ["Conexión", pick(["8 mm", "10 mm"], code)],
            ["Presión máxima", "8 bar" if diesel else "6 bar"],
        ]
    if name.startswith("Filtro de habitáculo"):
        return [
            ["Tipo", pick(["Partículas", "Carbón activado"], code)],
            ["Largo", f"{pick([200, 215, 235, 254], code)} mm"],
            ["Ancho", f"{pick([180, 200, 215], code)} mm"],
            ["Alto", f"{pick([25, 30, 35], code)} mm"],
        ]
    if name.startswith("Bujía"):
        electrode = {"NGK": "Iridio", "Denso": "Platino"}.get(manufacturer, "Níquel")
        return [
            ["Rosca", "M14 x 1,25"],
            ["Electrodo central", electrode],
            ["Calibración", pick(["0,8 mm", "0,9 mm", "1,0 mm"], code)],
            ["Grado térmico", pick(["5", "6", "7"], code)],
            ["Duración estimada", "60.000 km" if electrode != "Níquel" else "30.000 km"],
        ]
    if name.startswith("Bobina de encendido"):
        kind = pick(["Lápiz (una por cilindro)", "Bloque (4 salidas)"], code)
        return [
            ["Tipo", kind],
            ["Tensión de entrada", "12 V"],
            ["Conector", pick(["3 pines", "4 pines"], code)],
            ["Unidades", "1" if kind.startswith("Lápiz") else "1 (para los 4 cilindros)"],
        ]
    if name.startswith("Kit de distribución"):
        return [
            ["Incluye", "Correa, tensor y polea"],
            ["Dientes de la correa", str(pick([107, 113, 124, 137, 150], code))],
            ["Ancho de la correa", pick(["17 mm", "19 mm", "25,4 mm"], code)],
            ["Cambio recomendado", "Cada 60.000 km"],
        ]
    if name.startswith("Bomba de agua"):
        return [
            ["Impulsor", "Plástico" if manufacturer == "Gates" else "Metálico"],
            ["Junta", "Incluida"],
            ["Accionamiento", "Correa de distribución"],
        ]
    if name.startswith("Pastillas de freno"):
        material = {"Brembo": "Cerámico", "Ferodo": "Orgánico"}.get(manufacturer, "Semimetálico")
        return [
            ["Posición", "Delanteras"],
            ["Material", material],
            ["Ancho", mm([131, 138, 148, 156, 168])],
            ["Alto", mm([52, 54, 57, 59, 64])],
            ["Espesor", mm([17, 17, 18, 18, 19])],
            ["Sensor de desgaste", pick(["Incluido", "No incluido"], code)],
            ["Unidades", "4 (juego para el eje delantero)"],
        ]
    if name.startswith("Discos de freno"):
        return [
            ["Posición", "Delanteros"],
            ["Diámetro", mm([256, 262, 280, 285, 300])],
            ["Espesor", mm([22, 22, 24, 26, 28])],
            ["Tipo", "Sólido" if size == 0 and economy else "Ventilado"],
            ["Agujeros", str(pick([4, 5], code) if size < 4 else 6)],
            ["Material", "Fundición gris"],
            ["Unidades", "2 (par)"],
        ]
    if name.startswith("Amortiguador"):
        return [
            ["Posición", "Delantero"],
            ["Tipo", "Hidráulico" if manufacturer == "KYB" else "Gas presurizado"],
            ["Largo extendido", mm([480, 495, 510, 530, 560])],
            ["Largo comprimido", mm([330, 340, 350, 365, 380])],
            ["Unidades", "1"],
        ]
    if name.startswith("Faro"):
        return [
            ["Lámpara", pick(["H4", "H7 + H1", "H4 + LED diurna"], code)],
            ["Lente", "Policarbonato"],
            ["Regulación de altura", pick(["Manual", "Eléctrica"], code)],
            ["Lado", pick(["Izquierdo", "Derecho"], code)],
        ]
    if name.startswith("Radiador"):
        return [
            ["Material del núcleo", "Aluminio"],
            ["Tanques", "Plástico reforzado"],
            ["Ancho del núcleo", mm([550, 580, 610, 650, 700])],
            ["Alto del núcleo", mm([375, 390, 415, 440, 480])],
            ["Transmisión", pick(["Manual", "Manual y automática"], code)],
        ]
    if name.startswith("Refrigerante"):
        return [
            ["Volumen", "1 L"],
            ["Tipo", "Orgánico (OAT)"],
            ["Color", "Verde"],
            ["Preparación", "Listo para usar"],
        ]
    if name.startswith("Aceite de motor"):
        return [
            ["Viscosidad", "5W-30"],
            ["Volumen", "4 L"],
            ["Base", "Semisintético" if manufacturer == "Shell" else "Sintético"],
            ["Norma", "API SP / ACEA A3/B4"],
        ]
    if name.startswith("Escobilla"):
        return [
            ["Tipo", "Plana (sin armazón)" if manufacturer == "Bosch" else "Convencional"],
            ["Largo", f"{pick([450, 500, 550, 600], code)} mm"],
            ["Unidades", "1"],
        ]
    if name.startswith("Batería"):
        amp_hours = int(name.split("12V ")[1].removesuffix("Ah"))
        return [
            ["Tensión", "12 V"],
            ["Capacidad", f"{amp_hours} Ah"],
            ["Corriente de arranque (CCA)", f"{round(amp_hours * 9.5 / 10) * 10} A"],
            ["Medidas", {45: "207 x 175 x 175 mm", 60: "242 x 175 x 175 mm",
                         75: "278 x 175 x 190 mm", 90: "306 x 173 x 222 mm"}[amp_hours]],
            ["Polaridad", "Positivo a la derecha"],
        ]
    raise ValueError(f"Sin especificaciones para {name!r}")


def description(name, manufacturer, suffix):
    """Qué es el repuesto y para qué sirve. Los autos no van acá: están en
    las compatibilidades (la pestaña Aplicaciones del detalle)."""
    return f"{name} {manufacturer}{suffix}. {by_prefix(USES, name)}"


def warranty(name, manufacturer):
    provider = "vendedor" if manufacturer in VENDOR_WARRANTY else "fabricante"
    return by_prefix(WARRANTY_MONTHS, name), provider


def check_parts(parts, car_models):
    """Reglas que el catálogo tiene que cumplir. Falla en vez de escribir
    datos que no las cumplan."""
    car_brands = {m["brand"] for m in car_models}
    car_words = car_brands | {m["model"] for m in car_models}
    for part in parts:
        # El fabricante es quien hace el repuesto, nunca la marca del auto:
        # la marca del auto va en las compatibilidades.
        if part["manufacturer"] in car_brands:
            raise ValueError(f"{part['part_code']}: el fabricante {part['manufacturer']!r} es una marca de auto")
        if part["manufacturer"] not in part["name"]:
            raise ValueError(f"{part['part_code']}: el nombre no dice su fabricante")
        # Ni el nombre ni la descripción nombran autos: para qué autos es un
        # repuesto lo dicen sus compatibilidades.
        for field in ("name", "description"):
            words = set(re.findall(r"[\w-]+", part[field]))
            if words & car_words:
                raise ValueError(
                    f"{part['part_code']}: el campo {field} nombra un auto ({', '.join(sorted(words & car_words))})"
                )


def compatibility_entry(car_model):
    return {
        "brand": car_model["brand"],
        "model": car_model["model"],
        "engine_code": car_model["engine_code"],
        "year_from": car_model["year_from"],
        "year_to": car_model["year_to"],
    }


def build_parts(car_models):
    parts = []
    counters = {prefix: 0 for prefix in PREFIXES.values()}

    def next_code(category):
        prefix = PREFIXES[category]
        counters[prefix] += 1
        return f"{prefix}-{counters[prefix]:04d}"

    # Cada repuesto antes de elegir el fabricante. El fabricante va en el
    # nombre justo después del tipo ("Bujía NGK 1.4 8V"): los recordatorios
    # de mantenimiento y la estacionalidad reconocen el repuesto por cómo
    # empieza el nombre. Los de motor llevan el código del motor (es como se
    # piden en una casa de repuestos); la marca y el modelo del auto nunca
    # van en el nombre: están en las compatibilidades. El `group` (motor o
    # modelo) sigue decidiendo qué fabricantes hacen cada repuesto.
    # (name, suffix, category, base_price, color, compatible, group, by_segment)
    base_parts = []

    def base(name, suffix, category, base_price, color, compatible, group, by_segment=True):
        base_parts.append((name, suffix, category, base_price, color, compatible, group, by_segment))

    # Primero los autos del catálogo original y después los de las marcas
    # nuevas (ver NEW_BRAND_MODELS). Los universales y las baterías son uno
    # solo para todos los autos: van con el catálogo original.
    nuevas = {(brand, model) for brand, model, *_ in NEW_BRAND_MODELS}
    originales = [m for m in car_models if (m["brand"], m["model"]) not in nuevas]
    agregados = [m for m in car_models if (m["brand"], m["model"]) in nuevas]
    repetidos = {m["engine_code"] for m in agregados} & {m["engine_code"] for m in originales}
    if repetidos:
        raise ValueError(f"Motores de las marcas nuevas que ya estaban: {', '.join(sorted(repetidos))}")

    def por_motor_y_modelo(models):
        for engine_code, group in group_by_engine(models).items():
            for name, category, base_price, color in ENGINE_PARTS:
                base(name, f" {engine_code}", category, base_price, color, group, engine_code)

        for car_model in models:
            for name, category, base_price, color in MODEL_PARTS:
                group = f"{car_model['brand']} {car_model['model']}"
                base(name, "", category, base_price, color, [car_model], group)

    def agregados_despues(models):
        for engine_code, group in group_by_engine(models).items():
            for name, category, base_price, color in EXTRA_ENGINE_PARTS:
                base(name, f" {engine_code}", category, base_price, color, group, engine_code)

        for car_model in models:
            for name, category, base_price, color in EXTRA_MODEL_PARTS:
                group = f"{car_model['brand']} {car_model['model']}"
                base(name, "", category, base_price, color, [car_model], group)

        for (brand, model), group in group_by_model(models).items():
            for name, category, base_price, color in BODY_PARTS:
                base(name, "", category, base_price, color, group, f"{brand} {model}")

    por_motor_y_modelo(originales)

    for name, category, base_price, color in UNIVERSAL_PARTS:
        base(name, "", category, base_price, color, car_models, None)

    # --- Agregados después: siempre al final (ver EXTRA_ENGINE_PARTS).
    agregados_despues(originales)

    for name, price, fits in BATTERIES:
        base(name, "", "Eléctrico", price, None, [m for m in car_models if fits(m)], None, by_segment=False)

    def add(part, manufacturer, factor):
        name, suffix, category, base_price, color, compatible, _, by_segment = part
        code = next_code(category)
        price = base_price * factor
        warranty_months, warranty_provider = warranty(name, manufacturer)
        parts.append(
            {
                "part_code": code,
                "name": f"{name} {manufacturer}{suffix}",
                "manufacturer": manufacturer,
                "category": category,
                "color": color,
                "price": calc_price(price, compatible) if by_segment else int(round(price / 10) * 10),
                "stock": calc_stock(code, category),
                "description": description(name, manufacturer, suffix),
                "specifications": specifications(name, manufacturer, compatible, code),
                "warranty_months": warranty_months,
                "warranty_provider": warranty_provider,
                "compatibilities": [compatibility_entry(m) for m in compatible],
            }
        )

    # Primero el fabricante principal de cada repuesto, en el orden de
    # siempre, y al final los demás fabricantes.
    def con_fabricantes(lote):
        for part in lote:
            manufacturer, factor = manufacturers_of(part[0])[0]
            add(part, manufacturer, factor)

        for part in lote:
            for manufacturer, factor in manufacturers_of(part[0])[1:]:
                if covers(manufacturer, part[6]):
                    add(part, manufacturer, factor)

    con_fabricantes(base_parts)

    # --- Marcas nuevas: todos sus repuestos después de los que ya existían.
    base_parts.clear()
    por_motor_y_modelo(agregados)
    agregados_despues(agregados)
    con_fabricantes(base_parts)

    return parts


def main():
    car_models = build_car_models()
    parts = build_parts(car_models)
    check_parts(parts, car_models)

    DATA_DIR.mkdir(exist_ok=True)
    for filename, content in (
        ("car_models.json", {"car_models": car_models}),
        ("parts.json", {"parts": parts}),
    ):
        path = DATA_DIR / filename
        path.write_text(json.dumps(content, indent=2) + "\n", encoding="utf-8")

    compatibilities = sum(len(p["compatibilities"]) for p in parts)
    print(f"{len(car_models)} car models")
    print(f"{len(parts)} parts")
    print(f"{compatibilities} compatibility rows")


if __name__ == "__main__":
    main()
