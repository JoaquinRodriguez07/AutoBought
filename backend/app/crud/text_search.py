import re

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.crud.part import list_parts
from app.models.car_model import CarModel
from app.models.part import Part

# Años razonables para un auto: 1980 a 2039.
YEAR_PATTERN = re.compile(r"\b(19[89]\d|20[0-3]\d)\b")


def normalize(text: str) -> str:
    """Pasa a minúsculas y cambia signos por espacios.

    Mantiene letras con tilde (para que "bujía" siga coincidiendo con la
    base) y guiones (para modelos como "T-Cross").
    """
    text = text.lower()
    text = re.sub(r"[^\w\s-]", " ", text)
    text = text.replace("_", " ")
    return " ".join(text.split())


def _cut(text: str, match: re.Match) -> str:
    """Saca del texto el pedazo que encontró el match."""
    return " ".join((text[: match.start()] + " " + text[match.end():]).split())


def _take(text: str, phrase: str) -> tuple[bool, str]:
    """Busca `phrase` como palabra completa y, si está, la saca del texto."""
    match = re.search(rf"(?<!\S){re.escape(phrase)}(?!\S)", text)
    if not match:
        return False, text
    return True, _cut(text, match)


def extract_entities(db: Session, text: str) -> dict:
    """Separa una búsqueda libre en pieza, marca, modelo y año."""
    rest = normalize(text)
    entities = {"part": None, "brand": None, "model": None, "year": None}

    car_models = db.execute(select(CarModel.brand, CarModel.model).distinct()).all()

    # 1) Modelo. Va antes que el año porque hay modelos como "2008".
    #    Los más largos primero, para no quedarse con un pedazo.
    for brand, model in sorted(car_models, key=lambda row: len(row[1]), reverse=True):
        found, rest = _take(rest, normalize(model))
        if found:
            entities["brand"] = brand
            entities["model"] = model
            break

    # 2) Marca. Si el usuario la escribió, se saca del texto. Si no hubo
    #    modelo, la marca queda como entidad sola.
    for brand in {row[0] for row in car_models}:
        found, rest = _take(rest, normalize(brand))
        if found and entities["brand"] is None:
            entities["brand"] = brand

    # 3) Año.
    match = YEAR_PATTERN.search(rest)
    if match:
        entities["year"] = int(match.group())
        rest = _cut(rest, match)

    # 4) Lo que queda es la pieza, solo si algún repuesto la tiene en el nombre.
    if rest:
        pattern = f"%{rest}%"
        exists = db.scalar(
            select(Part.id)
            .where(or_(Part.name.ilike(pattern), Part.part_code.ilike(pattern)))
            .limit(1)
        )
        if exists:
            entities["part"] = rest

    return entities


def search_parts(
    db: Session, text: str, category: str | None = None
) -> tuple[dict, list[Part]]:
    """Extrae las entidades y busca los repuestos con los mismos filtros
    que usan los menús en cascada."""
    entities = extract_entities(db, text)

    # Sin nada reconocible no se devuelve el catálogo entero, sino vacío.
    if not any(entities.values()):
        return entities, []

    parts = list_parts(
        db,
        brand=entities["brand"],
        model=entities["model"],
        year=entities["year"],
        search=entities["part"],
        category=category,
    )
    return entities, parts