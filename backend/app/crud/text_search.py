import re

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.crud.part import list_parts
from app.models.car_model import CarModel
from app.models.part import Part

# Años razonables para un auto: 1980 a 2039.
YEAR_PATTERN = re.compile(r"\b(19[89]\d|20[0-3]\d)\b")

# Palabras que no pueden estar al principio ni al final de una pieza
# ("para" solo coincidiría con "limpiaparabrisas").
STOPWORDS = {
    "a", "al", "con", "de", "del", "el", "en", "la", "las",
    "lo", "los", "para", "por", "un", "una", "y",
}
# Tope de palabras para buscar la pieza. Cada pedazo posible es una
# consulta a la base: con n palabras son n*(n+1)/2 consultas, así que sin
# tope un texto largo dispararía miles. 8 palabras = 36 como máximo.
MAX_PART_WORDS = 8


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


def _part_exists(db: Session, phrase: str) -> bool:
    """True si algún repuesto tiene `phrase` en el nombre o el código."""
    pattern = f"%{phrase}%"
    found = db.scalar(
        select(Part.id)
        .where(or_(Part.name.ilike(pattern), Part.part_code.ilike(pattern)))
        .limit(1)
    )
    return found is not None


def _find_part(db: Session, text: str) -> str | None:
    """Busca el pedazo más largo del texto que coincide con algún repuesto.

    Con "pastillas de freno para" prueba primero las 4 palabras juntas,
    después de a 3 ("pastillas de freno" coincide) y se queda con esa.
    """
    words = text.split()[:MAX_PART_WORDS]
    for length in range(len(words), 0, -1):
        for start in range(len(words) - length + 1):
            candidate = words[start : start + length]
            if candidate[0] in STOPWORDS or candidate[-1] in STOPWORDS:
                continue
            phrase = " ".join(candidate)
            if _part_exists(db, phrase):
                return phrase
    return None


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

    # 4) Pieza: el pedazo más largo de lo que queda que coincida con un repuesto.
    if rest:
        entities["part"] = _find_part(db, rest)

    return entities


def search_parts(
    db: Session,
    text: str,
    brand: str | None = None,
    model: str | None = None,
    year: int | None = None,
    category: str | None = None,
) -> tuple[dict, list[Part]]:
    """Extrae las entidades y busca los repuestos con los mismos filtros
    que usan los menús en cascada.

    Si vienen filtros explícitos (brand, model, year), ganan sobre lo que
    se detectó en el texto: lo que el usuario eligió en los menús es más
    seguro que lo que se adivina.
    """
    entities = extract_entities(db, text)

    # Sin nada reconocible en el texto no se devuelve el catálogo entero.
    if not any(entities.values()):
        return entities, []

    parts = list_parts(
        db,
        brand=brand or entities["brand"],
        model=model or entities["model"],
        year=year or entities["year"],
        search=entities["part"],
        category=category,
    )
    return entities, parts