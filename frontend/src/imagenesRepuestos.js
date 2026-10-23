/**
 * imagenesRepuestos
 * ==========================================
 * Una imagen por TIPO de pieza. Los 1089 repuestos del catálogo salen de
 * 17 tipos (backend/scripts/generate_dataset.py): cambian el fabricante y
 * el auto, pero un disco de freno es un disco de freno. El tipo se
 * reconoce por cómo empieza el nombre ("Discos de freno delanteros
 * Brembo"), igual que los recordatorios de mantenimiento del backend.
 *
 * Para que el catálogo no se vea todo igual, cada FABRICANTE además tiene
 * su versión de la pieza (otro color, otro diseño): la del fabricante
 * principal es la imagen base del tipo y las demás se generan a partir de
 * ella, cambiando solo lo que dice `fabricantes`. En total son 46 imágenes.
 *
 * Las imágenes son ilustrativas y genéricas (sin marcas): se generan con
 * `npm run imagenes` (scripts/generar-imagenes.js) y se guardan en
 * public/repuestos/<archivo>.webp. Vite sirve `public/` en la raíz del
 * sitio, así que no hace falta importarlas.
 *
 * Para sumar un tipo o un fabricante: agregarlo acá, correr
 * `npm run imagenes` (genera solo las que faltan) y subir las imágenes.
 */

export const CARPETA_IMAGENES = "/repuestos";

// prefijo: cómo empieza el nombre del repuesto en el catálogo.
// archivo: nombre del .webp en public/repuestos (sin tildes ni espacios).
// pieza: qué se le pide dibujar al modelo de imágenes (en inglés, que es
//        como mejor responde).
// fabricantes: los que NO son el principal (el primero de MANUFACTURERS en
//        generate_dataset.py), con en qué se diferencia su versión.
export const TIPOS_REPUESTO = [
  // Filtros
  { prefijo: "Filtro de aceite", archivo: "filtro-aceite", pieza: "a new automotive spin-on engine oil filter: a short cylindrical steel canister painted in one solid color, with a flat steel base plate that has a central threaded hole surrounded by small inlet holes and a black rubber sealing gasket, shown at a three-quarter angle so the base plate is visible", fabricantes: { Bosch: "the canister is painted deep blue", Fram: "the canister is matte black and slightly taller" } },
  { prefijo: "Filtro de aire", archivo: "filtro-aire", pieza: "a new rectangular panel-type automotive engine air filter: a flat panel of folded off-white pleated filter paper held in a flexible polyurethane frame, seen from a three-quarter top angle", fabricantes: { Bosch: "the frame is black and the pleats are wider and more widely spaced", Fram: "the frame is dark blue and the filter paper is pale yellow" } },
  { prefijo: "Filtro de combustible", archivo: "filtro-combustible", pieza: "a new automotive inline fuel filter for a gasoline engine: a smooth metal cylinder about 10 cm long with a small hose nipple at each end and an embossed flow-direction arrow", fabricantes: { Bosch: "the housing is black plastic instead of metal, with angled hose fittings" } },
  { prefijo: "Filtro de habitáculo", archivo: "filtro-habitaculo", pieza: "a new automotive cabin (pollen) air filter: a thin flat rectangular element of white pleated non-woven filter fabric with flexible side strips", fabricantes: { Bosch: "the filter fabric is dark gray activated carbon instead of white" } },
  // Encendido
  { prefijo: "Bujía", archivo: "bujia", pieza: "a single new automotive spark plug: white ceramic insulator with ribs, hexagonal nickel-plated steel shell, threaded metal tip with one ground electrode and a terminal nut on top, lying at a slight angle", fabricantes: { Bosch: "it has a longer threaded tip with two ground electrodes", Denso: "it has a slimmer insulator and a thin fine-wire center electrode" } },
  { prefijo: "Bobina de encendido", archivo: "bobina-encendido", pieza: "a single new automotive pencil-type (coil-on-plug) ignition coil: a long black cylindrical body with a rubber boot at the bottom end and an electrical connector with a mounting tab at the top", fabricantes: { Delphi: "the body is dark gray with the electrical connector on the side", NGK: "the body is slimmer and the rubber boot is longer" } },
  // Motor
  { prefijo: "Kit de distribución", archivo: "kit-distribucion", pieza: "a new automotive timing belt kit laid out flat: one black rubber toothed timing belt coiled in a loop, one timing belt tensioner pulley with its metal mounting bracket, and one smooth idler pulley", fabricantes: { Contitech: "the belt is slightly wider and the tensioner has a differently shaped bracket", SKF: "the pulley hubs are painted blue" } },
  { prefijo: "Bomba de agua", archivo: "bomba-agua", pieza: "a new automotive engine coolant water pump: cast aluminum housing with mounting bolt holes, a metal impeller visible on the back side, a pulley flange on the front and a paper gasket", fabricantes: { Gates: "it has a black plastic impeller and a toothed pulley on the front" } },
  // Frenos
  { prefijo: "Pastillas de freno", archivo: "pastillas-freno", pieza: "a set of four new automotive disc brake pads: steel backing plates with dark gray friction material blocks and a central slot, neatly arranged in two pairs", fabricantes: { Brembo: "the friction material is light gray with chamfered edges", TRW: "the friction material is black and the backing plates have silver anti-noise shims", Ferodo: "each friction block has two slots instead of one" } },
  { prefijo: "Discos de freno", archivo: "discos-freno", pieza: "a pair of new ventilated automotive brake discs (rotors): machined cast iron friction surfaces, internal cooling vanes visible on the outer edge, and a center hat with a central bore and five lug holes", fabricantes: { TRW: "the center hat and outer edge have a black anti-corrosion coating", Fremax: "the center hat has a light gray coating and the cooling vanes are curved" } },
  // Suspensión
  { prefijo: "Amortiguador", archivo: "amortiguador", pieza: "a single new automotive front shock absorber cartridge without the coil spring: black painted steel tube body, polished chrome piston rod with a threaded end at the top, and a mounting bracket with two bolt holes at the bottom", fabricantes: { Sachs: "the body is painted silver gray", KYB: "the body is dark gray and there is a black bump stop on the rod" } },
  // Carrocería
  { prefijo: "Faro delantero", archivo: "faro-delantero", pieza: "a new car front headlight assembly (headlamp unit) on its own, not attached to a car, seen from the front at a slight angle: clear polycarbonate lens, chrome and black reflector with a projector lens, black plastic rear housing with mounting tabs", fabricantes: { Hella: "the inner housing is smoked dark and it has an LED daytime running light strip", Depo: "it has a simple halogen reflector without a projector lens" } },
  // Refrigeración
  { prefijo: "Radiador", archivo: "radiador", pieza: "a new automotive engine cooling radiator: rectangular aluminum fin-and-tube core with black plastic end tanks on the left and right sides, inlet and outlet hose necks and a filler neck", fabricantes: { Nissens: "it is all-aluminum, with aluminum end tanks instead of plastic" } },
  { prefijo: "Refrigerante", archivo: "refrigerante", pieza: "a 1 liter translucent plastic bottle filled with green engine antifreeze coolant, with a screw cap and a plain white label without any text", fabricantes: { Prestone: "the coolant is orange-red instead of green and the bottle is slightly squarer" } },
  // Lubricantes
  { prefijo: "Aceite de motor", archivo: "aceite-motor", pieza: "a 4 liter plastic jug of engine motor oil with an integrated handle, a screw cap and a translucent level stripe showing golden oil, with a plain label without any text", fabricantes: { Mobil: "the jug is dark gray", Shell: "the jug is white" } },
  // Accesorios
  { prefijo: "Escobilla", archivo: "escobilla", pieza: "a single new car windshield wiper blade, modern flat (beam) type with a black rubber blade and a universal plastic connector in the middle, lying diagonally", fabricantes: { Valeo: "it is a conventional blade with a metal frame (bracket) instead of a flat beam" } },
  // Eléctrico
  { prefijo: "Batería", archivo: "bateria", pieza: "a new 12V lead-acid car battery: black rectangular plastic case with a carrying handle on top and two lead terminal posts, one with a red cover and one with a black cover, plain label without any text", fabricantes: { Bosch: "the case is light gray with a dark blue top cover", Willard: "the case is dark gray with a recessed handle in the top" } },
];

/** El tipo de un repuesto según su nombre, o null si no es de ninguno. */
export function tipoDeRepuesto(nombre) {
  if (!nombre) return null;
  return TIPOS_REPUESTO.find((tipo) => nombre.startsWith(tipo.prefijo)) ?? null;
}

// "Mann-Filter" -> "mann-filter": para el nombre del archivo.
export function aSlug(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Todas las imágenes que tiene que haber: la base de cada tipo y la de
 * cada fabricante que no es el principal. Las usa el generador.
 */
export function imagenesEsperadas() {
  return TIPOS_REPUESTO.flatMap((tipo) => [
    { archivo: tipo.archivo, tipo, fabricante: null, cambio: null },
    ...Object.entries(tipo.fabricantes ?? {}).map(([fabricante, cambio]) => ({
      archivo: `${tipo.archivo}-${aSlug(fabricante)}`,
      tipo,
      fabricante,
      cambio,
    })),
  ]);
}

/**
 * La URL de la imagen de un repuesto, o null si su tipo no tiene imagen.
 * El fabricante sale del nombre ("Discos de freno delanteros TRW"), así
 * sirve igual para el catálogo y para el carrito, que no lo trae aparte.
 */
export function imagenDeTipo(nombre) {
  const tipo = tipoDeRepuesto(nombre);
  if (!tipo) return null;

  const fabricante = Object.keys(tipo.fabricantes ?? {}).find((f) => nombre.includes(` ${f}`));
  const archivo = fabricante ? `${tipo.archivo}-${aSlug(fabricante)}` : tipo.archivo;
  return `${CARPETA_IMAGENES}/${archivo}.webp`;
}
