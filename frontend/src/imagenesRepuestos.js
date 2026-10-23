/**
 * imagenesRepuestos
 * ==========================================
 * Una imagen por TIPO de pieza. Los 1089 repuestos del catálogo salen de
 * 17 tipos (backend/scripts/generate_dataset.py): cambian el fabricante y
 * el auto, pero un disco de freno es un disco de freno. El tipo se
 * reconoce por cómo empieza el nombre ("Discos de freno delanteros
 * Brembo"), igual que los recordatorios de mantenimiento del backend.
 *
 * Las imágenes son ilustrativas y genéricas (sin marcas): se generan con
 * `npm run imagenes` (scripts/generar-imagenes.js) a partir de `pieza`, y
 * se guardan en public/repuestos/<archivo>.webp. Vite sirve `public/` en
 * la raíz del sitio, así que no hace falta importarlas.
 *
 * Para sumar un tipo nuevo: agregarlo acá, correr
 * `npm run imagenes -- --solo <archivo>` y subir la imagen.
 */

export const CARPETA_IMAGENES = "/repuestos";

// prefijo: cómo empieza el nombre del repuesto en el catálogo.
// archivo: nombre del .webp en public/repuestos (sin tildes ni espacios).
// pieza: qué se le pide dibujar al modelo de imágenes (en inglés, que es
//        como mejor responde).
export const TIPOS_REPUESTO = [
  // Filtros
  { prefijo: "Filtro de aceite", archivo: "filtro-aceite", pieza: "a new automotive spin-on engine oil filter: a short cylindrical steel canister painted in one solid color, with a flat steel base plate that has a central threaded hole surrounded by small inlet holes and a black rubber sealing gasket, shown at a three-quarter angle so the base plate is visible" },
  { prefijo: "Filtro de aire", archivo: "filtro-aire", pieza: "a new rectangular panel-type automotive engine air filter: a flat panel of folded off-white pleated filter paper held in a flexible polyurethane frame, seen from a three-quarter top angle" },
  { prefijo: "Filtro de combustible", archivo: "filtro-combustible", pieza: "a new automotive inline fuel filter for a gasoline engine: a smooth metal cylinder about 10 cm long with a small hose nipple at each end and an embossed flow-direction arrow" },
  { prefijo: "Filtro de habitáculo", archivo: "filtro-habitaculo", pieza: "a new automotive cabin (pollen) air filter: a thin flat rectangular element of white pleated non-woven filter fabric with flexible side strips" },
  // Encendido
  { prefijo: "Bujía", archivo: "bujia", pieza: "a single new automotive spark plug: white ceramic insulator with ribs, hexagonal nickel-plated steel shell, threaded metal tip with one ground electrode and a terminal nut on top, lying at a slight angle" },
  { prefijo: "Bobina de encendido", archivo: "bobina-encendido", pieza: "a single new automotive pencil-type (coil-on-plug) ignition coil: a long black cylindrical body with a rubber boot at the bottom end and an electrical connector with a mounting tab at the top" },
  // Motor
  { prefijo: "Kit de distribución", archivo: "kit-distribucion", pieza: "a new automotive timing belt kit laid out flat: one black rubber toothed timing belt coiled in a loop, one timing belt tensioner pulley with its metal mounting bracket, and one smooth idler pulley" },
  { prefijo: "Bomba de agua", archivo: "bomba-agua", pieza: "a new automotive engine coolant water pump: cast aluminum housing with mounting bolt holes, a metal impeller visible on the back side, a pulley flange on the front and a paper gasket" },
  // Frenos
  { prefijo: "Pastillas de freno", archivo: "pastillas-freno", pieza: "a set of four new automotive disc brake pads: steel backing plates with dark gray friction material blocks and a central slot, neatly arranged in two pairs" },
  { prefijo: "Discos de freno", archivo: "discos-freno", pieza: "a pair of new ventilated automotive brake discs (rotors): machined cast iron friction surfaces, internal cooling vanes visible on the outer edge, and a center hat with a central bore and five lug holes" },
  // Suspensión
  { prefijo: "Amortiguador", archivo: "amortiguador", pieza: "a single new automotive front shock absorber cartridge without the coil spring: black painted steel tube body, polished chrome piston rod with a threaded end at the top, and a mounting bracket with two bolt holes at the bottom" },
  // Carrocería
  { prefijo: "Faro delantero", archivo: "faro-delantero", pieza: "a new car front headlight assembly (headlamp unit) on its own, not attached to a car, seen from the front at a slight angle: clear polycarbonate lens, chrome and black reflector with a projector lens, black plastic rear housing with mounting tabs" },
  // Refrigeración
  { prefijo: "Radiador", archivo: "radiador", pieza: "a new automotive engine cooling radiator: rectangular aluminum fin-and-tube core with black plastic end tanks on the left and right sides, inlet and outlet hose necks and a filler neck" },
  { prefijo: "Refrigerante", archivo: "refrigerante", pieza: "a 1 liter translucent plastic bottle filled with green engine antifreeze coolant, with a screw cap and a plain white label without any text" },
  // Lubricantes
  { prefijo: "Aceite de motor", archivo: "aceite-motor", pieza: "a 4 liter plastic jug of engine motor oil with an integrated handle, a screw cap and a translucent level stripe showing golden oil, with a plain label without any text" },
  // Accesorios
  { prefijo: "Escobilla", archivo: "escobilla", pieza: "a single new car windshield wiper blade, modern flat (beam) type with a black rubber blade and a universal plastic connector in the middle, lying diagonally" },
  // Eléctrico
  { prefijo: "Batería", archivo: "bateria", pieza: "a new 12V lead-acid car battery: black rectangular plastic case with a carrying handle on top and two lead terminal posts, one with a red cover and one with a black cover, plain label without any text" },
];

/** El tipo de un repuesto según su nombre, o null si no es de ninguno. */
export function tipoDeRepuesto(nombre) {
  if (!nombre) return null;
  return TIPOS_REPUESTO.find((tipo) => nombre.startsWith(tipo.prefijo)) ?? null;
}

/** La URL de la imagen de un repuesto, o null si su tipo no tiene imagen. */
export function imagenDeTipo(nombre) {
  const tipo = tipoDeRepuesto(nombre);
  return tipo ? `${CARPETA_IMAGENES}/${tipo.archivo}.webp` : null;
}
