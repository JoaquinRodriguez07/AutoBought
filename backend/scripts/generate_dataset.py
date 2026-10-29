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

# --- Tipos de repuesto agregados después (frenos traseros, dirección,
# transmisión, escape, eléctrico, climatización...). Se generan al final de
# todo (ver build_parts), para no cambiar los códigos de los que ya existían.

# Uno por motor (llevan el código del motor en el nombre).
NEW_ENGINE_PARTS = [
    ("Kit de embrague", "Transmisión", 9800, None),
    ("Correa poly-V", "Motor", 1450, None),
    ("Termostato", "Refrigeración", 1900, None),
    ("Junta de tapa de cilindros", "Motor", 2400, None),
    ("Motor de arranque", "Eléctrico", 11500, None),
    ("Alternador", "Eléctrico", 14800, None),
    ("Motor parcial", "Motor", 185000, None),
    ("Sonda lambda", "Escape", 3900, None),
    ("Compresor de aire acondicionado", "Climatización", 21500, None),
]

# Uno por plataforma: los modelos que comparten la base mecánica (y con ella
# estos repuestos), aunque sean de marcas distintas. Por modelo serían
# demasiados repuestos casi iguales.
NEW_PLATFORM_PARTS = [
    ("Bomba de freno", "Frenos", 5400, None),
    ("Amortiguador trasero", "Suspensión", 5300, None),
    ("Rótula", "Dirección", 1650, None),
    ("Extremo de dirección", "Dirección", 1500, None),
    ("Bujes de parrilla", "Suspensión", 1250, None),
    ("Bieleta de barra estabilizadora", "Suspensión", 1100, None),
    ("Rulemán de rueda delantero", "Suspensión", 2300, None),
    ("Homocinética", "Transmisión", 6900, None),
    ("Silenciador", "Escape", 4800, None),
    ("Catalizador", "Escape", 16500, None),
    ("Faro trasero", "Carrocería", 4200, "Rojo"),
    ("Espejo retrovisor exterior", "Carrocería", 3600, "Negro"),
]

# Frenos traseros: según la plataforma, discos (con sus pastillas) o campanas.
REAR_DISC_PARTS = [
    ("Pastillas de freno traseras", "Frenos", 2300, None),
    ("Discos de freno traseros", "Frenos", 3100, None),
]
REAR_DRUM_PARTS = [
    ("Campanas de freno traseras", "Frenos", 3300, None),
]

# Uno solo para todos los autos que lo usan: (name, category, price, color,
# qué autos lo usan). El precio es fijo, como el de las baterías.
NEW_UNIVERSAL_PARTS = [
    ("Líquido de frenos DOT 4 500 ml", "Frenos", 520, None, lambda m: True),
    ("Aceite de caja 75W90 1L", "Lubricantes", 990, None, lambda m: True),
    ("Kit de fusibles surtidos", "Eléctrico", 450, None, lambda m: True),
    ("Relé 12V 4 pines", "Eléctrico", 380, None, lambda m: True),
    # Los modelos más viejos usan H4 (una lámpara para alta y baja); los
    # más nuevos, H7 (una para cada luz).
    ("Lámpara de faro H4", "Eléctrico", 420, None, lambda m: m["year_from"] < 2016),
    ("Lámpara de faro H7", "Eléctrico", 480, None, lambda m: m["year_from"] >= 2016),
    ("Lámpara de señal W5W", "Eléctrico", 120, None, lambda m: True),
    ("Lámpara de señal P21W", "Eléctrico", 140, None, lambda m: True),
    ("Aditivo limpia inyectores nafta 300 ml", "Lubricantes", 690, None,
     lambda m: m["engine_code"] not in DIESEL_ENGINES),
    ("Aditivo limpia inyectores diésel 300 ml", "Lubricantes", 740, None,
     lambda m: m["engine_code"] in DIESEL_ENGINES),
    ("Líquido limpiaparabrisas 1L", "Accesorios", 290, "Azul", lambda m: True),
    ("Kit de seguridad vial", "Accesorios", 2900, None, lambda m: True),
]

# Plataforma de cada modelo, y si atrás frena con discos o con campanas.
# Cada modelo del catálogo tiene que estar en una (lo controla build_parts).
PLATFORMS = {
    "GM Gamma": ("campanas", [("Chevrolet", "Onix"), ("Chevrolet", "Prisma"),
                              ("Chevrolet", "Corsa"), ("Chevrolet", "Spin")]),
    "GM Delta": ("discos", [("Chevrolet", "Cruze"), ("Chevrolet", "Tracker")]),
    "GM S10": ("campanas", [("Chevrolet", "S10")]),
    "Fiat MP1": ("campanas", [("Fiat", "Cronos"), ("Fiat", "Argo")]),
    "Fiat 178": ("campanas", [("Fiat", "Palio"), ("Fiat", "Siena"), ("Fiat", "Uno"), ("Fiat", "Strada")]),
    "FCA Small Wide": ("discos", [("Fiat", "Toro"), ("Jeep", "Renegade"), ("Jeep", "Compass")]),
    "VW PQ24": ("campanas", [("Volkswagen", "Gol"), ("Volkswagen", "Voyage"), ("Volkswagen", "Saveiro")]),
    "VW MQB A0": ("campanas", [("Volkswagen", "Polo"), ("Volkswagen", "Virtus"), ("Volkswagen", "T-Cross")]),
    "VW MQB A": ("discos", [("Audi", "A3"), ("Audi", "Q3")]),
    "VW Amarok": ("campanas", [("Volkswagen", "Amarok")]),
    "Ford B": ("campanas", [("Ford", "Fiesta"), ("Ford", "Ka"), ("Ford", "EcoSport")]),
    "Ford C": ("discos", [("Ford", "Focus")]),
    "Ford T6": ("campanas", [("Ford", "Ranger")]),
    "Renault B0": ("campanas", [("Renault", "Sandero"), ("Renault", "Logan"),
                                ("Renault", "Stepway"), ("Renault", "Duster")]),
    "Renault CMF-A": ("campanas", [("Renault", "Kwid")]),
    "Renault Kangoo": ("campanas", [("Renault", "Kangoo")]),
    "PSA PF1": ("campanas", [("Peugeot", "208"), ("Peugeot", "2008"), ("Citroen", "C3")]),
    "PSA Partner": ("campanas", [("Peugeot", "Partner"), ("Citroen", "Berlingo")]),
    "Toyota EFC": ("campanas", [("Toyota", "Etios"), ("Toyota", "Yaris")]),
    "Toyota TNGA-C": ("discos", [("Toyota", "Corolla")]),
    "Toyota IMV": ("campanas", [("Toyota", "Hilux")]),
    "Nissan V": ("campanas", [("Nissan", "March"), ("Nissan", "Versa"), ("Nissan", "Kicks")]),
    "Nissan Frontier": ("campanas", [("Nissan", "Frontier")]),
    "Hyundai-Kia chicos": ("campanas", [("Hyundai", "HB20"), ("Kia", "Rio")]),
    "Hyundai Creta": ("discos", [("Hyundai", "Creta")]),
    "Kia Sportage": ("discos", [("Kia", "Sportage")]),
    "Suzuki chicos": ("campanas", [("Suzuki", "Swift"), ("Suzuki", "Celerio")]),
    "Suzuki Vitara": ("discos", [("Suzuki", "Vitara")]),
    "Chery Tiggo 2": ("campanas", [("Chery", "Tiggo 2")]),
    "Chery T1X": ("discos", [("Chery", "Tiggo 4"), ("Chery", "Tiggo 7")]),
    "BYD DM-i": ("discos", [("BYD", "Song Pro DM-i"), ("BYD", "King DM-i")]),
    "GAC GS": ("discos", [("GAC", "GS3"), ("GAC", "GS4")]),
    "Mercedes MFA2": ("discos", [("Mercedes-Benz", "Clase A")]),
    "Mercedes MRA": ("discos", [("Mercedes-Benz", "Clase C")]),
    "Mercedes Sprinter": ("discos", [("Mercedes-Benz", "Sprinter")]),
    "BMW UKL2": ("discos", [("BMW", "Serie 1"), ("BMW", "X1")]),
    "BMW CLAR": ("discos", [("BMW", "Serie 3")]),
    "Geely BMA": ("discos", [("Geely", "Coolray")]),
    "Geely Emgrand": ("campanas", [("Geely", "Emgrand")]),
    "Mitsubishi L200": ("campanas", [("Mitsubishi", "L200")]),
    "Mitsubishi GS": ("discos", [("Mitsubishi", "Outlander"), ("Mitsubishi", "ASX")]),
    "Honda chicos": ("campanas", [("Honda", "Fit"), ("Honda", "City"), ("Honda", "HR-V")]),
    "Honda Civic": ("discos", [("Honda", "Civic")]),
    "JAC S2": ("campanas", [("JAC", "S2")]),
    "JAC T8": ("campanas", [("JAC", "T8")]),
    "Mazda2": ("campanas", [("Mazda", "Mazda2")]),
    "Mazda Skyactiv": ("discos", [("Mazda", "Mazda3"), ("Mazda", "CX-5")]),
}

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
    # Tipos agregados después. "Faro trasero" usa los de "Faro" y las
    # pastillas, discos y amortiguadores traseros, los de los delanteros.
    "Kit de embrague": [("Sachs", 1.0), ("Valeo", 0.95), ("LuK", 1.05)],
    "Correa poly-V": [("Gates", 1.0), ("Contitech", 0.95)],
    "Termostato": [("Wahler", 1.0), ("Gates", 0.9)],
    "Junta de tapa de cilindros": [("Elring", 1.0), ("Victor Reinz", 0.95)],
    "Motor de arranque": [("Bosch", 1.0), ("Valeo", 0.95)],
    "Alternador": [("Bosch", 1.0), ("Valeo", 0.95)],
    "Motor parcial": [("Jasper", 1.0)],
    "Sonda lambda": [("Bosch", 1.0), ("NGK", 0.95)],
    "Compresor de aire acondicionado": [("Denso", 1.0), ("Valeo", 0.95), ("Sanden", 0.9)],
    "Bomba de freno": [("TRW", 1.0), ("Bosch", 1.05)],
    "Rótula": [("TRW", 1.0), ("Moog", 1.05)],
    "Extremo de dirección": [("TRW", 1.0), ("Moog", 1.05)],
    "Bujes de parrilla": [("Febi", 1.0), ("Moog", 1.1)],
    "Bieleta de barra estabilizadora": [("Febi", 1.0), ("Moog", 1.1)],
    "Rulemán de rueda": [("SKF", 1.0), ("FAG", 0.95)],
    "Homocinética": [("GKN", 1.0), ("SKF", 0.95)],
    "Silenciador": [("Walker", 1.0), ("Bosal", 0.9)],
    "Catalizador": [("Walker", 1.0), ("Bosal", 0.9)],
    "Espejo retrovisor": [("Metagal", 1.0), ("Fitam", 0.9)],
    "Campanas de freno": [("Fremax", 1.0), ("TRW", 1.1)],
    "Líquido de frenos": [("Bosch", 1.0), ("ATE", 1.1)],
    "Aceite de caja": [("Castrol", 1.0), ("Mobil", 1.05)],
    "Kit de fusibles": [("Bosch", 1.0), ("Hella", 0.95)],
    "Relé": [("Bosch", 1.0), ("Hella", 0.95)],
    "Lámpara de faro": [("Philips", 1.0), ("Osram", 1.0)],
    "Lámpara de señal": [("Philips", 1.0), ("Osram", 1.0)],
    "Aditivo limpia inyectores": [("Liqui Moly", 1.0), ("Wynn's", 0.9)],
    "Líquido limpiaparabrisas": [("Prestone", 1.0), ("Liqui Moly", 1.15)],
    "Kit de seguridad": [("Würth", 1.0)],
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
    "Kit de embrague": 12,
    "Correa poly-V": 12,
    "Termostato": 12,
    "Junta de tapa de cilindros": 12,
    "Motor de arranque": 12,
    "Alternador": 12,
    "Motor parcial": 6,
    "Sonda lambda": 12,
    "Compresor de aire acondicionado": 12,
    "Bomba de freno": 12,
    "Rótula": 12,
    "Extremo de dirección": 12,
    "Bujes de parrilla": 12,
    "Bieleta de barra estabilizadora": 12,
    "Rulemán de rueda": 12,
    "Homocinética": 12,
    "Silenciador": 12,
    "Catalizador": 24,
    "Espejo retrovisor": 12,
    "Campanas de freno": 12,
    "Líquido de frenos": 6,
    "Aceite de caja": 6,
    "Kit de fusibles": 6,
    "Relé": 6,
    "Lámpara": 6,
    "Aditivo limpia inyectores": 6,
    "Líquido limpiaparabrisas": 6,
    "Kit de seguridad": 12,
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
    "Faro trasero": "Conjunto óptico trasero completo (posición, freno, giro y marcha atrás), "
                    "listo para instalar. Las lámparas se venden aparte.",
    "Faro": "Conjunto óptico completo, listo para instalar. Las lámparas se venden aparte.",
    "Radiador": "Disipa el calor del refrigerante para que el motor no recaliente.",
    "Refrigerante": "Mantiene la temperatura del motor y lo protege de la corrosión. "
                    "Listo para usar, sin diluir.",
    "Aceite de motor": "Lubrica y protege el motor. Alcanza para un cambio completo en la "
                       "mayoría de los motores nafteros chicos y medianos.",
    "Escobilla": "Limpia el parabrisas sin dejar marcas. Se recomienda cambiarla una vez "
                 "por año o cuando empieza a rayar o a dejar agua.",
    "Kit de embrague": "Transmite la fuerza del motor a la caja. Incluye placa, disco y "
                       "rulemán de empuje: se cambian juntos cuando el embrague patina o queda alto.",
    "Correa poly-V": "Mueve el alternador, la bomba de dirección y el compresor del aire "
                     "acondicionado. Se recomienda revisarla cada 40.000 km.",
    "Termostato": "Regula el paso del refrigerante para que el motor llegue rápido a su "
                  "temperatura y no recaliente. Se cambia junto con la junta.",
    "Junta de tapa de cilindros": "Sella la tapa de cilindros contra el block. Si falla, el "
                                  "motor pierde compresión, recalienta o mezcla aceite y agua.",
    "Motor de arranque": "Hace girar el motor para que arranque. Si falla, se escucha un "
                         "clic o el motor gira despacio aunque la batería esté bien.",
    "Alternador": "Genera la electricidad del auto y carga la batería con el motor en marcha. "
                  "Si falla, se enciende la luz de batería en el tablero.",
    "Motor parcial": "Block y tapa de cilindros armados, remanufacturados y probados en banco. "
                     "Se instala con los accesorios del motor original.",
    "Sonda lambda": "Mide el oxígeno de los gases de escape para que la computadora ajuste la "
                    "mezcla. Si falla, sube el consumo y se enciende la luz de motor.",
    "Compresor de aire acondicionado": "Comprime el gas del aire acondicionado para que enfríe. "
                                       "Se entrega con aceite; la carga de gas se hace al instalarlo.",
    "Bomba de freno": "Convierte la fuerza del pedal en presión de líquido para los frenos. "
                      "Si falla, el pedal se va al fondo o queda esponjoso.",
    "Rótula": "Une la parrilla con la mangueta y deja girar la rueda. Una rótula gastada "
              "hace ruido en los pozos y desalinea el tren delantero.",
    "Extremo de dirección": "Une la cremallera de dirección con la rueda. Si tiene juego, la "
                            "dirección queda floja y las cubiertas se gastan de forma despareja.",
    "Bujes de parrilla": "Amortiguan las vibraciones entre la parrilla y la carrocería. Se "
                         "cambian de a pares cuando el auto golpea o tira hacia un lado.",
    "Bieleta de barra estabilizadora": "Une la barra estabilizadora con la suspensión y reduce "
                                       "el balanceo en las curvas. Gastada, golpetea en calles con pozos.",
    "Rulemán de rueda": "Deja girar la rueda con poca fricción. Si falla, se escucha un "
                        "zumbido que aumenta con la velocidad.",
    "Homocinética": "Transmite la fuerza de la caja a la rueda mientras la rueda gira y sube "
                    "y baja. Si falla, hace un ruido seco al doblar.",
    "Silenciador": "Reduce el ruido de los gases de escape. Se entrega con abrazaderas y gomas "
                   "de sujeción.",
    "Catalizador": "Transforma los gases contaminantes del escape en gases menos dañinos. "
                   "Homologado para la norma de emisiones vigente.",
    "Espejo retrovisor": "Espejo exterior completo con su carcasa y el vidrio, listo para "
                         "instalar en la puerta.",
    "Campanas de freno": "Tambores contra los que frenan las zapatas traseras. Se cambian de "
                         "a pares, junto con zapatas nuevas.",
    "Líquido de frenos": "Transmite la presión del pedal a los frenos. Absorbe humedad con el "
                         "tiempo: se recomienda cambiarlo cada 2 años.",
    "Aceite de caja": "Lubrica los engranajes de la caja manual y los diferenciales. Se "
                      "recomienda cambiarlo cada 60.000 km.",
    "Kit de fusibles": "Surtido de fusibles de cuchilla de los amperajes más usados, en su "
                       "estuche, con pinza para sacarlos.",
    "Relé": "Relé universal de 4 pines, para luces, electroventilador, bocina o bomba de "
            "combustible.",
    "Lámpara de faro": "Lámpara halógena para las luces altas y bajas. Se recomienda cambiarlas "
                       "de a pares para que alumbren igual.",
    "Lámpara de señal": "Lámpara para las luces de posición, freno, giro o patente. Se vende "
                        "por unidad.",
    "Aditivo limpia inyectores": "Limpia los inyectores y la cámara de combustión. Se agrega al "
                                 "tanque lleno, una vez cada 5.000 km.",
    "Líquido limpiaparabrisas": "Limpia el parabrisas sin dejar marcas y no daña la pintura ni "
                                "las gomas. Listo para usar.",
    "Kit de seguridad": "Baliza triangular, chaleco reflectivo y matafuego de 1 kg, en un bolso. "
                        "Son los elementos obligatorios para circular en Uruguay.",
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
    "Dirección": "STR",
    "Transmisión": "TRN",
    "Escape": "EXH",
    "Climatización": "HVA",
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
    if name.startswith("Pastillas de freno traseras"):
        material = {"Brembo": "Cerámico", "Ferodo": "Orgánico"}.get(manufacturer, "Semimetálico")
        return [
            ["Posición", "Traseras"],
            ["Material", material],
            ["Ancho", mm([95, 99, 105, 110, 116])],
            ["Alto", mm([41, 43, 45, 47, 50])],
            ["Espesor", mm([15, 15, 16, 16, 17])],
            ["Unidades", "4 (juego para el eje trasero)"],
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
    if name.startswith("Discos de freno traseros"):
        return [
            ["Posición", "Traseros"],
            ["Diámetro", mm([249, 253, 264, 272, 290])],
            ["Espesor", mm([9, 10, 10, 12, 12])],
            ["Tipo", "Sólido"],
            ["Agujeros", str(pick([4, 5], code) if size < 4 else 6)],
            ["Material", "Fundición gris"],
            ["Unidades", "2 (par)"],
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
    if name.startswith("Amortiguador trasero"):
        return [
            ["Posición", "Trasero"],
            ["Tipo", "Hidráulico" if manufacturer == "KYB" else "Gas presurizado"],
            ["Largo extendido", mm([520, 540, 560, 590, 640])],
            ["Largo comprimido", mm([340, 350, 360, 375, 400])],
            ["Fijación", "Ojo y perno" if size == 4 else "Ojo y vástago roscado"],
            ["Unidades", "1"],
        ]
    if name.startswith("Amortiguador"):
        return [
            ["Posición", "Delantero"],
            ["Tipo", "Hidráulico" if manufacturer == "KYB" else "Gas presurizado"],
            ["Largo extendido", mm([480, 495, 510, 530, 560])],
            ["Largo comprimido", mm([330, 340, 350, 365, 380])],
            ["Unidades", "1"],
        ]
    if name.startswith("Faro trasero"):
        return [
            ["Tecnología", pick(["Lámparas convencionales", "LED en la luz de posición"], code)],
            ["Funciones", "Posición, freno, giro y marcha atrás"],
            ["Lente", "Policarbonato rojo y transparente"],
            ["Lado", pick(["Izquierdo", "Derecho"], code)],
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
    # --- Tipos agregados después.
    if name.startswith("Kit de embrague"):
        return [
            ["Incluye", "Placa, disco y rulemán de empuje"],
            ["Diámetro del disco", mm([190, 200, 215, 228, 250])],
            ["Estrías", str(pick([20, 22, 23, 24], code))],
            ["Accionamiento", pick(["Por cable", "Hidráulico"], code)],
        ]
    if name.startswith("Correa poly-V"):
        return [
            ["Perfil", f"{pick([4, 5, 6], code)}PK"],
            ["Largo", f"{pick([1015, 1100, 1210, 1325, 1470], code)} mm"],
            ["Material", "EPDM"],
        ]
    if name.startswith("Termostato"):
        return [
            ["Temperatura de apertura", f"{pick([82, 87, 89, 92], code)} °C"],
            ["Junta", "Incluida"],
            ["Tipo", pick(["Con carcasa", "Sin carcasa (solo la válvula)"], code)],
        ]
    if name.startswith("Junta de tapa de cilindros"):
        return [
            ["Material", "Multicapa de acero (MLS)"],
            ["Espesor", f"{pick(['0,9', '1,1', '1,3'], code)} mm"],
            ["Cilindros", "4"],
        ]
    if name.startswith("Motor de arranque"):
        return [
            ["Tensión", "12 V"],
            ["Potencia", f"{pick(['0,9', '1,1', '1,4'], code) if not diesel else '2,2'} kW"],
            ["Dientes del piñón", str(pick([9, 10, 11], code))],
            ["Estado", "Nuevo"],
        ]
    if name.startswith("Alternador"):
        return [
            ["Tensión", "14 V"],
            ["Corriente", f"{pick([90, 110, 120], code) if not diesel else 140} A"],
            ["Polea", pick(["5 canales", "6 canales"], code)],
            ["Regulador", "Incluido"],
        ]
    if name.startswith("Motor parcial"):
        return [
            ["Incluye", "Block, cigüeñal, pistones, bielas y tapa de cilindros"],
            ["No incluye", "Múltiples, inyección, alternador ni arranque"],
            ["Combustible", "Diésel" if diesel else "Nafta"],
            ["Estado", "Remanufacturado y probado en banco"],
            ["Entrega", "Contra entrega del motor usado"],
        ]
    if name.startswith("Sonda lambda"):
        return [
            ["Tipo", "Banda ancha" if diesel else pick(["De salto (zirconio)", "Banda ancha"], code)],
            ["Cables", str(pick([4, 5], code))],
            ["Ubicación", pick(["Antes del catalizador", "Después del catalizador"], code)],
        ]
    if name.startswith("Compresor de aire acondicionado"):
        return [
            ["Gas", "R134a"],
            ["Tipo", pick(["Pistones variables", "Paletas"], code)],
            ["Polea", f"{pick([6, 7], code)} canales"],
            ["Tensión del embrague", "12 V"],
        ]
    if name.startswith("Bomba de freno"):
        return [
            ["Diámetro del pistón", mm(["20,64", "22,22", "23,81", "25,4", "25,4"])],
            ["Circuitos", "2 (en diagonal)"],
            ["Depósito", "Incluido" if size < 4 else "No incluido"],
        ]
    if name.startswith("Rótula"):
        return [
            ["Posición", "Delantera inferior"],
            ["Cono", mm([16, 17, 18, 18, 20])],
            ["Fijación", pick(["Abulonada", "A presión"], code)],
            ["Unidades", "1"],
        ]
    if name.startswith("Extremo de dirección"):
        return [
            ["Rosca", pick(["M12 x 1,25", "M14 x 1,5"], code)],
            ["Lado", pick(["Izquierdo", "Derecho"], code)],
            ["Unidades", "1"],
        ]
    if name.startswith("Bujes de parrilla"):
        return [
            ["Material", "Caucho con alma de acero"],
            ["Posición", "Delanteros y traseros de la parrilla"],
            ["Unidades", "2 (juego para una parrilla)"],
        ]
    if name.startswith("Bieleta de barra estabilizadora"):
        return [
            ["Largo", mm([240, 255, 270, 290, 310])],
            ["Posición", "Delantera"],
            ["Unidades", "1"],
        ]
    if name.startswith("Rulemán de rueda"):
        return [
            ["Tipo", pick(["Doble hilera de bolillas", "Maza con rulemán integrado"], code)],
            ["Sensor ABS", pick(["Incluido", "No incluido"], code)],
            ["Diámetro exterior", mm([64, 68, 72, 76, 84])],
            ["Posición", "Delantero"],
        ]
    if name.startswith("Homocinética"):
        return [
            ["Lado", "Rueda"],
            ["Estrías (rueda / palier)", f"{pick([22, 23, 25], code)} / {pick([22, 23, 25], code + 'x')}"],
            ["Incluye", "Fuelle, abrazaderas y grasa"],
        ]
    if name.startswith("Silenciador"):
        return [
            ["Posición", "Trasero"],
            ["Material", "Acero aluminizado" if manufacturer == "Bosal" else "Acero inoxidable"],
            ["Diámetro de entrada", mm([42, 45, 50, 55, 60])],
        ]
    if name.startswith("Catalizador"):
        return [
            ["Norma", "Euro 5" if diesel else "Euro 5 / Euro 6"],
            ["Sustrato", "Cerámico"],
            ["Diámetro de entrada", mm([45, 50, 55, 60, 65])],
        ]
    if name.startswith("Espejo retrovisor"):
        return [
            ["Regulación", pick(["Manual", "Eléctrica"], code)],
            ["Lado", pick(["Izquierdo", "Derecho"], code)],
            ["Luz de giro", pick(["Incluida", "No incluida"], code)],
        ]
    if name.startswith("Campanas de freno"):
        return [
            ["Posición", "Traseras"],
            ["Diámetro interior", mm([180, 200, 203, 228, 254])],
            ["Agujeros", str(pick([4, 5], code) if size < 4 else 6)],
            ["Material", "Fundición gris"],
            ["Unidades", "2 (par)"],
        ]
    if name.startswith("Líquido de frenos"):
        return [
            ["Norma", "DOT 4"],
            ["Volumen", "500 ml"],
            ["Punto de ebullición", "265 °C"],
            ["Base", "Glicol"],
        ]
    if name.startswith("Aceite de caja"):
        return [
            ["Viscosidad", "75W-90"],
            ["Volumen", "1 L"],
            ["Norma", "API GL-4"],
            ["Uso", "Cajas manuales y diferenciales"],
        ]
    if name.startswith("Kit de fusibles"):
        return [
            ["Tipo", "Cuchilla (estándar y mini)"],
            ["Amperajes", "5, 7,5, 10, 15, 20, 25 y 30 A"],
            ["Cantidad", "40 fusibles y una pinza"],
        ]
    if name.startswith("Relé"):
        return [
            ["Tensión", "12 V"],
            ["Corriente máxima", "30 A"],
            ["Contactos", "4 pines (normal abierto)"],
        ]
    if name.startswith("Lámpara de faro"):
        socket = name.split("faro ")[1].split()[0]
        return [
            ["Tipo", socket],
            ["Tecnología", "Halógena"],
            ["Potencia", "60/55 W" if socket == "H4" else "55 W"],
            ["Tensión", "12 V"],
            ["Unidades", "1"],
        ]
    if name.startswith("Lámpara de señal"):
        socket = name.split("señal ")[1].split()[0]
        return [
            ["Tipo", socket],
            ["Potencia", "5 W" if socket == "W5W" else "21 W"],
            ["Uso", "Posición y patente" if socket == "W5W" else "Freno, giro y marcha atrás"],
            ["Tensión", "12 V"],
        ]
    if name.startswith("Aditivo limpia inyectores"):
        return [
            ["Combustible", "Diésel" if "diésel" in name else "Nafta"],
            ["Volumen", "300 ml"],
            ["Rinde", "Un tanque de hasta 60 L"],
        ]
    if name.startswith("Líquido limpiaparabrisas"):
        return [
            ["Volumen", "1 L"],
            ["Preparación", "Listo para usar"],
            ["Anticongelante", "Hasta -5 °C"],
        ]
    if name.startswith("Kit de seguridad"):
        return [
            ["Incluye", "Baliza triangular, chaleco reflectivo y matafuego"],
            ["Matafuego", "1 kg, polvo ABC, con soporte"],
            ["Bolso", "Incluido"],
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

    # --- Tipos de repuesto nuevos (ver NEW_ENGINE_PARTS), para todos los
    # autos, después de todo lo anterior.
    base_parts.clear()
    en_plataforma = {model for _, models in PLATFORMS.values() for model in models}
    sin_plataforma = {(m["brand"], m["model"]) for m in car_models} - en_plataforma
    if sin_plataforma:
        raise ValueError(f"Modelos sin plataforma: {sorted(sin_plataforma)}")

    for engine_code, group in group_by_engine(car_models).items():
        for name, category, base_price, color in NEW_ENGINE_PARTS:
            base(name, f" {engine_code}", category, base_price, color, group, engine_code)

    for platform, (rear_brakes, models) in PLATFORMS.items():
        group = [m for m in car_models if (m["brand"], m["model"]) in models]
        if not group:
            continue
        rear = REAR_DISC_PARTS if rear_brakes == "discos" else REAR_DRUM_PARTS
        for name, category, base_price, color in NEW_PLATFORM_PARTS + rear:
            base(name, "", category, base_price, color, group, platform)

    for name, category, price, color, fits in NEW_UNIVERSAL_PARTS:
        base(name, "", category, price, color, [m for m in car_models if fits(m)], None, by_segment=False)

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
