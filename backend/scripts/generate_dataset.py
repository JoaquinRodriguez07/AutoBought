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
"""

import json
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


def calc_price(base_price, compatible_models):
    factor = max(SEGMENT_FACTOR[m["segment"]] for m in compatible_models)
    return int(round(base_price * factor / 10) * 10)


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

    def add(name, category, base_price, color, compatible):
        code = next_code(category)
        parts.append(
            {
                "part_code": code,
                "name": name,
                "category": category,
                "color": color,
                "price": calc_price(base_price, compatible),
                "stock": calc_stock(code, category),
                "compatibilities": [compatibility_entry(m) for m in compatible],
            }
        )

    for engine_code, models in group_by_engine(car_models).items():
        for name, category, base_price, color in ENGINE_PARTS:
            add(f"{name} {engine_code}", category, base_price, color, models)

    for car_model in car_models:
        for name, category, base_price, color in MODEL_PARTS:
            add(
                f"{name} {car_model['brand']} {car_model['model']}",
                category,
                base_price,
                color,
                [car_model],
            )

    for name, category, base_price, color in UNIVERSAL_PARTS:
        add(name, category, base_price, color, car_models)

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
