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
  { prefijo: "Filtro de aceite", archivo: "filtro-aceite", pieza: "an automotive spin-on engine oil filter, a cylindrical metal canister with a threaded base plate and rubber gasket" },
  { prefijo: "Filtro de aire", archivo: "filtro-aire", pieza: "a rectangular automotive engine air filter element with pleated paper inside a rubber frame" },
  { prefijo: "Filtro de combustible", archivo: "filtro-combustible", pieza: "an automotive inline fuel filter, a metal cylinder with a hose connector at each end" },
  { prefijo: "Filtro de habitáculo", archivo: "filtro-habitaculo", pieza: "a car cabin air filter, a flat rectangular pleated white filter element" },
  // Encendido
  { prefijo: "Bujía", archivo: "bujia", pieza: "a single automotive spark plug with white ceramic insulator and metal threaded tip" },
  { prefijo: "Bobina de encendido", archivo: "bobina-encendido", pieza: "an automotive pencil-type ignition coil with connector" },
  // Motor
  { prefijo: "Kit de distribución", archivo: "kit-distribucion", pieza: "an automotive timing belt kit: a black toothed timing belt with a tensioner pulley and an idler pulley" },
  { prefijo: "Bomba de agua", archivo: "bomba-agua", pieza: "an automotive engine water pump with metal housing, impeller and pulley flange" },
  // Frenos
  { prefijo: "Pastillas de freno", archivo: "pastillas-freno", pieza: "a set of four automotive disc brake pads with metal backing plates" },
  { prefijo: "Discos de freno", archivo: "discos-freno", pieza: "a pair of ventilated automotive brake discs (brake rotors)" },
  // Suspensión
  { prefijo: "Amortiguador", archivo: "amortiguador", pieza: "an automotive front shock absorber strut" },
  // Carrocería
  { prefijo: "Faro delantero", archivo: "faro-delantero", pieza: "a modern car front headlight assembly (headlamp unit) with clear lens" },
  // Refrigeración
  { prefijo: "Radiador", archivo: "radiador", pieza: "a car engine cooling radiator with aluminum core and plastic side tanks" },
  { prefijo: "Refrigerante", archivo: "refrigerante", pieza: "a 1 liter plastic bottle of green engine coolant with a plain blank label" },
  // Lubricantes
  { prefijo: "Aceite de motor", archivo: "aceite-motor", pieza: "a 4 liter plastic jug of motor oil with a plain blank label" },
  // Accesorios
  { prefijo: "Escobilla", archivo: "escobilla", pieza: "a car windshield wiper blade, flat beam type" },
  // Eléctrico
  { prefijo: "Batería", archivo: "bateria", pieza: "a 12V car battery with black plastic case and two terminals, plain unbranded label" },
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
