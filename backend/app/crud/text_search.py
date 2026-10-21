import difflib
import re
import unicodedata
from collections import Counter

from sqlalchemy import select
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

# Largo máximo de una pieza, en palabras. Ningún nombre de repuesto es más
# largo, así que no tiene sentido probar pedazos más grandes.
MAX_PART_WORDS = 8


# Sinónimos del rubro: lo que el cliente suele escribir -> cómo se llama la
# pieza en el catálogo. Las claves van sin tildes y en minúsculas; pueden ser
# de varias palabras. Para agregar uno basta una línea nueva.
SYNONYMS = {
    # Pastillas de freno
    "balata": "pastillas de freno",
    "balatas": "pastillas de freno",
    "pastas de freno": "pastillas de freno",
    "pastas freno": "pastillas de freno",
    "pastilla freno": "pastillas de freno",
    "pastillas freno": "pastillas de freno",
    "pastillas de frenos": "pastillas de freno",
    "pads de freno": "pastillas de freno",
    "brake pads": "pastillas de freno",
    # Discos de freno
    "rotor": "discos de freno",
    "rotores": "discos de freno",
    "rotor de freno": "discos de freno",
    "rotores de freno": "discos de freno",
    "disco freno": "discos de freno",
    "discos freno": "discos de freno",
    "discos de frenos": "discos de freno",
    "brake disc": "discos de freno",
    # Bujías
    "candela": "bujía",
    "candelas": "bujía",
    "chispero": "bujía",
    "chisperos": "bujía",
    "bujia de encendido": "bujía",
    "bujias de encendido": "bujía",
    "spark plug": "bujía",
    "spark plugs": "bujía",
    # Bobina
    "bobina de ignicion": "bobina de encendido",
    "bobinas de ignicion": "bobina de encendido",
    "bobina de chispa": "bobina de encendido",
    "bobina de bujia": "bobina de encendido",
    "bobinas de bujia": "bobina de encendido",
    "ignition coil": "bobina de encendido",
    # Bomba de agua
    "bomba agua": "bomba de agua",
    "bomba de refrigerante": "bomba de agua",
    "bomba del agua": "bomba de agua",
    "bomba de enfriamiento": "bomba de agua",
    "water pump": "bomba de agua",
    # Batería
    "acumulador": "batería",
    "acumuladores": "batería",
    "bateria de auto": "batería",
    "pila de auto": "batería",
    "battery": "batería",
    # Aceite
    "aceite motor": "aceite de motor",
    "aceite del motor": "aceite de motor",
    "lubricante": "aceite de motor",
    "lubricante de motor": "aceite de motor",
    "lubricante del motor": "aceite de motor",
    "engine oil": "aceite de motor",
    # Filtros
    "filtro aceite": "filtro de aceite",
    "filtro del aceite": "filtro de aceite",
    "oil filter": "filtro de aceite",
    "filtro aire": "filtro de aire",
    "filtro del aire": "filtro de aire",
    "filtro de motor": "filtro de aire",
    "air filter": "filtro de aire",
    # Estos conservan el combustible: "filtro de gasoil" es el filtro de
    # combustible de un auto diésel.
    "filtro de nafta": "filtro de combustible nafta",
    "filtro de gasolina": "filtro de combustible nafta",
    "filtro de bencina": "filtro de combustible nafta",
    "filtro nafta": "filtro de combustible nafta",
    "filtro de gasoil": "filtro de combustible gasoil",
    "filtro de diesel": "filtro de combustible gasoil",
    "filtro gasoil": "filtro de combustible gasoil",
    "filtro combustible": "filtro de combustible",
    "filtro del combustible": "filtro de combustible",
    "fuel filter": "filtro de combustible",
    "filtro de cabina": "filtro de habitáculo",
    "filtro del habitaculo": "filtro de habitáculo",
    "filtro habitaculo": "filtro de habitáculo",
    "filtro de polen": "filtro de habitáculo",
    "filtro antipolen": "filtro de habitáculo",
    "filtro de aire acondicionado": "filtro de habitáculo",
    "filtro de aire de cabina": "filtro de habitáculo",
    "filtro del aire acondicionado": "filtro de habitáculo",
    "cabin filter": "filtro de habitáculo",
    # Distribución
    "correa de distribucion": "kit de distribución",
    "correa de tiempo": "kit de distribución",
    "correa del tiempo": "kit de distribución",
    "correa de la distribucion": "kit de distribución",
    "kit de correa": "kit de distribución",
    "kit de tiempo": "kit de distribución",
    "kit de cadena": "kit de distribución",
    "kit distribucion": "kit de distribución",
    "cadena de distribucion": "kit de distribución",
    "distribucion": "kit de distribución",
    "timing belt": "kit de distribución",
    "timing kit": "kit de distribución",
    # Limpiaparabrisas
    "plumilla": "escobilla limpiaparabrisas",
    "plumillas": "escobilla limpiaparabrisas",
    "escobilla": "escobilla limpiaparabrisas",
    "escobillas": "escobilla limpiaparabrisas",
    "limpia parabrisas": "escobilla limpiaparabrisas",
    "limpiavidrios": "escobilla limpiaparabrisas",
    "limpia vidrios": "escobilla limpiaparabrisas",
    "plumas limpiaparabrisas": "escobilla limpiaparabrisas",
    "plumas de limpiaparabrisas": "escobilla limpiaparabrisas",
    "wiper": "escobilla limpiaparabrisas",
    "wipers": "escobilla limpiaparabrisas",
    # Radiador y refrigerante
    "enfriador": "radiador",
    "enfriador de motor": "radiador",
    "anticongelante": "refrigerante",
    "anti congelante": "refrigerante",
    "liquido refrigerante": "refrigerante",
    "liquido de refrigeracion": "refrigerante",
    "liquido de radiador": "refrigerante",
    "liquido del radiador": "refrigerante",
    "agua del radiador": "refrigerante",
    "coolant": "refrigerante",
    # Amortiguadores
    "shock": "amortiguador",
    "shocks": "amortiguador",
    "shock absorber": "amortiguador",
    "amortiguadores": "amortiguador",
    "suspension delantera": "amortiguador delantero",
    # Faros
    "farol": "faro delantero",
    "faroles": "faro delantero",
    "farol delantero": "faro delantero",
    "faros": "faro delantero",
    "optica": "faro delantero",
    "opticas": "faro delantero",
    "optica delantera": "faro delantero",
    "luz delantera": "faro delantero",
    "luces delanteras": "faro delantero",
    "headlight": "faro delantero",
    "headlights": "faro delantero",
}

# Combustible. Las palabras que usa la gente -> tipo. No es un dato del
# catálogo: se traduce a los motores (engine_code) que lo usan.
FUEL_WORDS = {
    "gasolero": "diesel",
    "gasoleros": "diesel",
    "gasolera": "diesel",
    "gasoil": "diesel",
    "gasoleo": "diesel",
    "diesel": "diesel",
    "disel": "diesel",
    "naftero": "nafta",
    "nafteros": "nafta",
    "naftera": "nafta",
    "nafta": "nafta",
    "gasolina": "nafta",
    "gasolinero": "nafta",
    "bencina": "nafta",
    "bencinero": "nafta",
}

# Motores diésel del catálogo (en minúsculas). Cualquier otro motor se
# considera nafta. Si se carga un motor diésel nuevo, hay que sumarlo acá.
DIESEL_ENGINES = {
    "1.6 hdi",       # Citroen Berlingo, Peugeot Partner
    "2.0 multijet",  # Fiat Toro
    "2.0 tdi",       # Volkswagen Amarok
    "2.3 ys23",      # Nissan Frontier
    "2.8 1gd",       # Toyota Hilux
    "2.8 duramax",   # Chevrolet S10
    "3.2 duratorq",  # Ford Ranger
}

# Qué tan parecida tiene que ser una palabra a otra del catálogo (0 a 1) para
# tomarla como un error de tipeo. 0.8 corrige "pastiyas" -> "pastillas" sin
# convertir palabras sueltas de relleno en piezas.
TYPO_CUTOFF = 0.8

# Las palabras más cortas no se corrigen: con 3 letras casi todo se parece a algo.
MIN_TYPO_LENGTH = 4


def normalize(text: str) -> str:
    """Pasa a minúsculas y cambia signos por espacios.

    Mantiene letras con tilde (para que "bujía" siga coincidiendo con la
    base) y guiones (para modelos como "T-Cross").
    """
    text = text.lower()
    text = re.sub(r"[^\w\s-]", " ", text)
    text = text.replace("_", " ")
    return " ".join(text.split())


def _fold(text: str) -> str:
    """Saca las tildes para comparar ("bujia" == "bujía")."""
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


_SYNONYMS_FOLDED = {
    tuple(_fold(key).split()): value for key, value in SYNONYMS.items()
}
_MAX_SYNONYM_WORDS = max(len(key) for key in _SYNONYMS_FOLDED)


def apply_synonyms(text: str) -> str:
    """Cambia los sinónimos del rubro por el nombre que usa el catálogo.

    "balatas onix 2020" -> "pastillas de freno onix 2020". Compara sin tildes
    y por palabras completas, probando primero las frases más largas.
    """
    words = text.split()
    folded = [_fold(word) for word in words]
    result: list[str] = []
    i = 0
    while i < len(words):
        for length in range(min(_MAX_SYNONYM_WORDS, len(words) - i), 0, -1):
            replacement = _SYNONYMS_FOLDED.get(tuple(folded[i : i + length]))
            if replacement:
                result.append(replacement)
                i += length
                break
        else:
            result.append(words[i])
            i += 1
    return " ".join(result)


def _load_searchable(db: Session) -> list[str]:
    """Nombres y códigos de todos los repuestos, en minúsculas."""
    return [
        value.lower()
        for row in db.execute(select(Part.name, Part.part_code)).all()
        for value in row
    ]


def _correct_typos(words: list[str], searchable: list[str]) -> list[str]:
    """Cambia las palabras que no existen en el catálogo por la más parecida.

    Usa `difflib` con las palabras de los nombres de repuestos como
    vocabulario. Una palabra que ya existe, un número o una palabra muy corta
    se dejan como están.
    """
    vocabulary: dict[str, str] = {}
    for value in searchable:
        for word in normalize(value).split():
            if word not in STOPWORDS and len(word) >= MIN_TYPO_LENGTH:
                vocabulary.setdefault(_fold(word), word)

    corrected = []
    for word in words:
        key = _fold(word)
        if (
            word in STOPWORDS
            or len(word) < MIN_TYPO_LENGTH
            or any(c.isdigit() for c in word)
        ):
            corrected.append(word)
            continue
        if key in vocabulary:
            # Existe, pero quizás sin tilde ("bateria"): se usa la del catálogo.
            corrected.append(vocabulary[key])
            continue
        close = difflib.get_close_matches(key, vocabulary, n=1, cutoff=TYPO_CUTOFF)
        corrected.append(vocabulary[close[0]] if close else word)
    return corrected


def _cut(text: str, match: re.Match) -> str:
    """Saca del texto el pedazo que encontró el match."""
    return " ".join((text[: match.start()] + " " + text[match.end():]).split())


def _take(text: str, phrase: str) -> tuple[bool, str]:
    """Busca `phrase` como palabra completa y, si está, la saca del texto."""
    match = re.search(rf"(?<!\S){re.escape(phrase)}(?!\S)", text)
    if not match:
        return False, text
    return True, _cut(text, match)


def _content_words(words: list[str]) -> list[str]:
    return [word for word in words if word not in STOPWORDS]


def _take_fuel(text: str) -> tuple[str | None, str]:
    """Detecta "gasolero", "naftero", etc. y los saca del texto.

    Devuelve "diesel" o "nafta" (o None) y el texto sin esas palabras.
    Tolera errores de tipeo en palabras de 5 letras o más.
    """
    fuel = None
    kept = []
    for word in text.split():
        key = _fold(word)
        found = FUEL_WORDS.get(key)
        if not found and len(key) >= 5 and not any(c.isdigit() for c in key):
            close = difflib.get_close_matches(key, FUEL_WORDS, n=1, cutoff=TYPO_CUTOFF)
            found = FUEL_WORDS[close[0]] if close else None
        if found:
            fuel = fuel or found
        else:
            kept.append(word)
    return fuel, " ".join(kept)


def _find_contiguous(words: list[str], searchable: list[str]) -> str | None:
    """Busca el pedazo más largo, en el mismo orden, que está en algún repuesto.

    Con "pastillas de freno para" prueba primero las 4 palabras juntas,
    después de a 3 ("pastillas de freno" coincide) y se queda con esa.
    """
    for length in range(min(len(words), MAX_PART_WORDS), 0, -1):
        for start in range(len(words) - length + 1):
            candidate = words[start : start + length]
            if candidate[0] in STOPWORDS or candidate[-1] in STOPWORDS:
                continue
            phrase = " ".join(candidate)
            if any(phrase in value for value in searchable):
                return phrase
    return None


def _find_unordered(
    words: list[str], searchable: list[str]
) -> tuple[str, int] | None:
    """Busca la pieza aunque las palabras vengan en otro orden.

    Se queda con los repuestos que contienen más palabras de la búsqueda
    ("freno pastillas" -> "Pastillas de freno ...") y devuelve el pedazo del
    nombre que va de la primera a la última palabra encontrada, en el orden
    del catálogo, junto con la cantidad de palabras que coincidieron.
    """
    wanted = {_fold(word) for word in _content_words(words)}
    best_count = 0
    spans: Counter[str] = Counter()

    for value in searchable:
        name_words = normalize(value).split()
        hits = [
            index
            for index, word in enumerate(name_words)
            if _fold(word) in wanted
        ]
        matched = {_fold(name_words[index]) for index in hits}
        if len(matched) < best_count or not matched:
            continue
        if len(matched) > best_count:
            best_count = len(matched)
            spans.clear()
        spans[" ".join(name_words[hits[0] : hits[-1] + 1])] += 1

    if not best_count:
        return None
    # Entre varios nombres posibles gana el que más se repite y, si empatan,
    # el más corto.
    phrase = min(spans, key=lambda span: (-spans[span], len(span)))
    return phrase, best_count


def _find_part(db: Session, text: str) -> str | None:
    """Encuentra la pieza de la búsqueda.

    Los nombres y códigos se traen una sola vez de la base y todo se compara
    en memoria, así una búsqueda es siempre una sola consulta. Primero se
    corrigen los errores de tipeo y después se elige entre:
    - el pedazo más largo en el mismo orden que el catálogo, o
    - las palabras en cualquier orden, si cubren más palabras que el anterior.
    """
    searchable = _load_searchable(db)
    words = _correct_typos(text.split(), searchable)

    contiguous = _find_contiguous(words, searchable)
    unordered = _find_unordered(words, searchable)

    contiguous_count = len(_content_words(contiguous.split())) if contiguous else 0
    if unordered and unordered[1] > contiguous_count:
        return unordered[0]
    return contiguous


def extract_entities(db: Session, text: str) -> dict:
    """Separa una búsqueda libre en pieza, marca, modelo y año."""
    rest = apply_synonyms(normalize(text))
    entities = {"part": None, "brand": None, "model": None, "year": None, "fuel": None}

    # 0) Combustible. Va primero para que "gasolero" no se confunda con otra cosa.
    entities["fuel"], rest = _take_fuel(rest)

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


def _engines_for_fuel(db: Session, fuel: str | None) -> list[str] | None:
    """Motores del catálogo que corresponden a "diesel" o "nafta"."""
    if not fuel:
        return None
    engines = {
        code.lower()
        for (code,) in db.execute(select(CarModel.engine_code).distinct()).all()
        if code
    }
    if fuel == "diesel":
        return sorted(engines & DIESEL_ENGINES) or [""]
    return sorted(engines - DIESEL_ENGINES) or [""]


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

    engine_codes = _engines_for_fuel(db, entities["fuel"])

    parts = list_parts(
        db,
        engine_codes=engine_codes,
        brand=brand or entities["brand"],
        model=model or entities["model"],
        year=year or entities["year"],
        search=entities["part"],
        category=category,
    )
    return entities, parts