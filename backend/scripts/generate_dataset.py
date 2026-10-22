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
        for brand, model, engine_code, year_from, year_to, segment in CAR_MODELS
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
    # empieza el nombre.
    # (name, suffix, category, base_price, color, compatible, group, by_segment)
    base_parts = []

    def base(name, suffix, category, base_price, color, compatible, group, by_segment=True):
        base_parts.append((name, suffix, category, base_price, color, compatible, group, by_segment))

    for engine_code, models in group_by_engine(car_models).items():
        for name, category, base_price, color in ENGINE_PARTS:
            base(name, f" {engine_code}", category, base_price, color, models, engine_code)

    for car_model in car_models:
        for name, category, base_price, color in MODEL_PARTS:
            group = f"{car_model['brand']} {car_model['model']}"
            base(name, f" {group}", category, base_price, color, [car_model], group)

    for name, category, base_price, color in UNIVERSAL_PARTS:
        base(name, "", category, base_price, color, car_models, None)

    # --- Agregados después: siempre al final (ver EXTRA_ENGINE_PARTS).
    for engine_code, models in group_by_engine(car_models).items():
        for name, category, base_price, color in EXTRA_ENGINE_PARTS:
            base(name, f" {engine_code}", category, base_price, color, models, engine_code)

    for car_model in car_models:
        for name, category, base_price, color in EXTRA_MODEL_PARTS:
            group = f"{car_model['brand']} {car_model['model']}"
            base(name, f" {group}", category, base_price, color, [car_model], group)

    for (brand, model), models in group_by_model(car_models).items():
        for name, category, base_price, color in BODY_PARTS:
            base(name, f" {brand} {model}", category, base_price, color, models, f"{brand} {model}")

    for name, price, fits in BATTERIES:
        base(name, "", "Eléctrico", price, None, [m for m in car_models if fits(m)], None, by_segment=False)

    def add(part, manufacturer, factor):
        name, suffix, category, base_price, color, compatible, _, by_segment = part
        code = next_code(category)
        price = base_price * factor
        parts.append(
            {
                "part_code": code,
                "name": f"{name} {manufacturer}{suffix}",
                "manufacturer": manufacturer,
                "category": category,
                "color": color,
                "price": calc_price(price, compatible) if by_segment else int(round(price / 10) * 10),
                "stock": calc_stock(code, category),
                "compatibilities": [compatibility_entry(m) for m in compatible],
            }
        )

    # Primero el fabricante principal de cada repuesto, en el orden de
    # siempre, y al final los demás fabricantes.
    for part in base_parts:
        manufacturer, factor = manufacturers_of(part[0])[0]
        add(part, manufacturer, factor)

    for part in base_parts:
        for manufacturer, factor in manufacturers_of(part[0])[1:]:
            if covers(manufacturer, part[6]):
                add(part, manufacturer, factor)

    return parts


def main():
    car_models = build_car_models()
    parts = build_parts(car_models)

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
