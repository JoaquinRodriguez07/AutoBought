/**
 * imagenesRepuestos
 * ==========================================
 * Una imagen por TIPO de pieza. Los 3990 repuestos del catálogo salen de
 * 47 tipos (backend/scripts/generate_dataset.py): cambian el fabricante y
 * el auto, pero un disco de freno es un disco de freno. El tipo se
 * reconoce por cómo empieza el nombre ("Discos de freno delanteros
 * Brembo"), igual que los recordatorios de mantenimiento del backend.
 *
 * Para que el catálogo no se vea todo igual, cada FABRICANTE además tiene
 * su versión de la pieza: la del fabricante principal es la imagen base del
 * tipo y las demás se generan a partir de ella, con colores parecidos a los
 * de cada marca (sin logos ni texto) y otro ángulo, según `fabricantes`.
 * En total son 46 imágenes.
 *
 * Cada imagen tiene además una segunda vista de la misma pieza desde otro
 * ángulo (<archivo>-vista.webp), para la galería del detalle: se genera con
 * `npm run imagenes -- --vistas` a partir de la imagen principal.
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
// vista: la segunda foto de cada imagen (otro ángulo de la MISMA pieza),
//        que el detalle muestra como miniatura.
// fabricantes: los que NO son el principal (el primero de MANUFACTURERS en
//        generate_dataset.py), con en qué se diferencia su versión.
export const TIPOS_REPUESTO = [
  // Filtros
  { prefijo: "Filtro de aceite", archivo: "filtro-aceite", pieza: "a new automotive spin-on engine oil filter: a short cylindrical steel canister painted in one solid color, with a flat steel base plate that has a central threaded hole surrounded by small inlet holes and a black rubber sealing gasket, shown at a three-quarter angle so the base plate is visible", vista: "seen from below, showing the base plate with the threaded center hole, the small inlet holes and the rubber gasket", fabricantes: { Bosch: "the canister is blue with a thin white stripe, and the filter stands upright seen from the side", Fram: "the canister is bright orange, seen from a higher angle looking down at the base plate" } },
  { prefijo: "Filtro de aire", archivo: "filtro-aire", pieza: "a new rectangular panel-type automotive engine air filter: a flat panel of folded off-white pleated filter paper held in a flexible polyurethane frame, seen from a three-quarter top angle", vista: "seen from the side at eye level, showing the depth of the pleats and the profile of the frame", fabricantes: { Bosch: "the frame is black and the pleats are white, seen straight from above", Fram: "the frame is orange and the filter paper is pale yellow, standing on its long edge" } },
  { prefijo: "Filtro de combustible", archivo: "filtro-combustible", pieza: "a new automotive inline fuel filter for a gasoline engine: a smooth metal cylinder about 10 cm long with a small hose nipple at each end and an embossed flow-direction arrow", vista: "seen from one end, showing the hose fitting and the round profile of the housing", fabricantes: { Bosch: "the housing is black plastic with angled hose fittings, lying horizontally seen from the side" } },
  { prefijo: "Filtro de habitáculo", archivo: "filtro-habitaculo", pieza: "a new automotive cabin (pollen) air filter: a thin flat rectangular element of white pleated non-woven filter fabric with flexible side strips", vista: "seen from the side at a low angle, showing the thickness of the pleats", fabricantes: { Bosch: "the filter fabric is dark gray activated carbon with a blue side strip, standing slightly tilted" } },
  // Encendido
  { prefijo: "Bujía", archivo: "bujia", pieza: "a single new automotive spark plug: white ceramic insulator with ribs, hexagonal nickel-plated steel shell, threaded metal tip with one ground electrode and a terminal nut on top, lying at a slight angle", vista: "a close-up of the threaded tip and the electrode, seen from the side", fabricantes: { Bosch: "it has a longer threaded tip with two ground electrodes and a blue band on the shell, standing upright", Denso: "it has a slimmer insulator, a thin fine-wire center electrode and a red band, lying flat seen from the side" } },
  { prefijo: "Bobina de encendido", archivo: "bobina-encendido", pieza: "a single new automotive pencil-type (coil-on-plug) ignition coil: a long black cylindrical body with a rubber boot at the bottom end and an electrical connector with a mounting tab at the top", vista: "seen from the connector end, showing the electrical connector and the mounting tab", fabricantes: { Delphi: "the body is dark gray with a white top and the connector on the side, standing upright", NGK: "the body is slimmer with a blue rubber boot, lying diagonally" } },
  // Motor
  { prefijo: "Kit de distribución", archivo: "kit-distribucion", pieza: "a new automotive timing belt kit laid out flat: one black rubber toothed timing belt coiled in a loop, one timing belt tensioner pulley with its metal mounting bracket, and one smooth idler pulley", vista: "a close-up of the toothed side of the belt resting on one of the pulleys", fabricantes: { Contitech: "the belt is slightly wider and the pulley hubs are painted yellow, with the belt stretched in an oval", SKF: "the pulley hubs are dark blue and the kit also includes a small metal water pump, seen from above" } },
  { prefijo: "Bomba de agua", archivo: "bomba-agua", pieza: "a new automotive engine coolant water pump: cast aluminum housing with mounting bolt holes, a metal impeller visible on the back side, a pulley flange on the front and a paper gasket", vista: "seen from the back, showing the impeller and the gasket face", fabricantes: { Gates: "it has a black plastic impeller and a black toothed pulley, seen from the pulley side" } },
  // Frenos
  { prefijo: "Pastillas de freno", archivo: "pastillas-freno", pieza: "a set of four new automotive disc brake pads: steel backing plates with dark gray friction material blocks and a central slot, neatly arranged in two pairs", vista: "a single pad seen from the friction side, close-up", fabricantes: { Brembo: "the backing plates are painted red and the friction material is light gray, with the four pads fanned out", TRW: "the friction material is black and the backing plates have silver anti-noise shims, two pads seen face-on", Ferodo: "the backing plates are dark green and each friction block has two slots, seen from a low side angle" } },
  { prefijo: "Discos de freno", archivo: "discos-freno", pieza: "a pair of new ventilated automotive brake discs (rotors): machined cast iron friction surfaces, internal cooling vanes visible on the outer edge, and a center hat with a central bore and five lug holes", vista: "a single disc seen edge-on from the side, showing the internal cooling vanes", fabricantes: { TRW: "the center hat and outer edge have a black anti-corrosion coating, with one disc standing upright in front of the other", Fremax: "the center hat has a light gray coating and the cooling vanes are curved, a single disc seen from above" } },
  // Suspensión
  { prefijo: "Amortiguador", archivo: "amortiguador", pieza: "a single new automotive front shock absorber cartridge without the coil spring: black painted steel tube body, polished chrome piston rod with a threaded end at the top, and a mounting bracket with two bolt holes at the bottom", vista: "a close-up of the top end, showing the piston rod and its threaded end", fabricantes: { Sachs: "the body is painted silver gray, lying horizontally", KYB: "the body is dark gray with a blue band near the top, standing upright" } },
  // Carrocería
  { prefijo: "Faro delantero", archivo: "faro-delantero", pieza: "a new car front headlight assembly (headlamp unit) on its own, not attached to a car, seen from the front at a slight angle: clear polycarbonate lens, chrome and black reflector with a projector lens, black plastic rear housing with mounting tabs", vista: "seen from the back, showing the rear housing, the bulb sockets and the mounting tabs", fabricantes: { Hella: "the inner housing is smoked black with an LED daytime running light strip, seen from the front left", Depo: "it has a simple halogen reflector without a projector lens and an amber turn signal, seen straight from the front" } },
  // Refrigeración
  { prefijo: "Radiador", archivo: "radiador", pieza: "a new automotive engine cooling radiator: rectangular aluminum fin-and-tube core with black plastic end tanks on the left and right sides, inlet and outlet hose necks and a filler neck", vista: "seen from the side at an angle, showing the thickness of the core and one hose neck", fabricantes: { Nissens: "it is all-aluminum including the end tanks, standing upright seen straight from the front" } },
  { prefijo: "Refrigerante", archivo: "refrigerante", pieza: "a 1 liter translucent plastic bottle filled with green engine antifreeze coolant, with a screw cap and a plain white label without any text", vista: "seen from the side of the bottle at a slight angle", fabricantes: { Prestone: "the coolant is orange-red and the bottle is yellow-tinted and slightly squarer" } },
  // Lubricantes
  { prefijo: "Aceite de motor", archivo: "aceite-motor", pieza: "a 4 liter plastic jug of engine motor oil with an integrated handle, a screw cap and a translucent level stripe showing golden oil, with a plain label without any text", vista: "seen from the side, showing the handle and the translucent level stripe", fabricantes: { Mobil: "the jug is dark gray with a red cap", Shell: "the jug is yellow with a red cap" } },
  // Accesorios
  { prefijo: "Escobilla", archivo: "escobilla", pieza: "a single new car windshield wiper blade, modern flat (beam) type with a black rubber blade and a universal plastic connector in the middle, lying diagonally", vista: "a close-up of the center connector and the edge of the rubber blade", fabricantes: { Valeo: "it is a conventional blade with a metal frame (bracket), lying horizontally" } },
  // Eléctrico
  { prefijo: "Batería", archivo: "bateria", pieza: "a new 12V lead-acid car battery: black rectangular plastic case with a carrying handle on top and two lead terminal posts, one with a red cover and one with a black cover, plain label without any text", vista: "seen from above, showing the top cover and both terminal posts", fabricantes: { Bosch: "the case is light gray with a dark blue top cover, seen from the front right", Willard: "the case is dark gray with a red top cover and a recessed handle, seen from slightly above" } },
  // --- Tipos agregados después
  // Frenos
  { prefijo: "Campanas de freno", archivo: "campanas-freno", pieza: "a pair of new automotive rear brake drums: cast iron cylinders with a machined inner braking surface, cooling fins on the outside and a flat face with a central bore and lug holes", vista: "seen from the open side, showing the machined inner braking surface", fabricantes: { TRW: "the outer surface has a black anti-corrosion coating, a single drum standing on its edge" } },
  { prefijo: "Bomba de freno", archivo: "bomba-freno", pieza: "a new automotive brake master cylinder: an elongated cast aluminum body with two outlet ports and a mounting flange with two bolt holes, with a translucent white plastic brake fluid reservoir on top", vista: "seen from the flange side, showing the piston bore and the mounting holes", fabricantes: { Bosch: "the body is dark gray cast iron and the reservoir has a black cap, seen from the side" } },
  { prefijo: "Líquido de frenos", archivo: "liquido-frenos", pieza: "a 500 ml plastic bottle of automotive brake fluid: a narrow white bottle with a tall spout cap and a plain label without any text", vista: "seen from the side, showing the spout cap", fabricantes: { ATE: "the bottle is yellow with a black cap" } },
  // Dirección y suspensión
  { prefijo: "Rótula", archivo: "rotula", pieza: "a single new automotive suspension ball joint: a round steel housing with a black rubber dust boot and a tapered threaded stud with a castle nut, on a flat three-hole mounting flange", vista: "seen from below, showing the mounting flange and its bolt holes", fabricantes: { Moog: "the housing has a grease fitting and a red dust boot, lying on its side" } },
  { prefijo: "Extremo de dirección", archivo: "extremo-direccion", pieza: "a single new automotive outer tie rod end: a forged steel arm with a ball joint and black rubber boot at one end, a tapered stud with a nut, and an internally threaded shaft at the other end", vista: "a close-up of the ball joint end with the rubber boot and the stud", fabricantes: { Moog: "the arm is painted dark gray and the boot is red, seen from above" } },
  { prefijo: "Bujes de parrilla", archivo: "bujes-parrilla", pieza: "a pair of new automotive control arm bushings: two cylindrical black rubber bushings bonded between an inner steel sleeve and an outer steel shell", vista: "a single bushing seen end-on, showing the rubber between the two sleeves", fabricantes: { Moog: "the rubber is dark red and the outer shells are zinc plated" } },
  { prefijo: "Bieleta de barra estabilizadora", archivo: "bieleta", pieza: "a single new automotive stabilizer (sway bar) link: a straight steel rod with a small ball joint and threaded stud at each end, each covered by a black rubber boot", vista: "a close-up of one ball joint end with its boot and stud", fabricantes: { Moog: "the rod is silver and the boots are red, lying diagonally" } },
  { prefijo: "Rulemán de rueda", archivo: "ruleman-rueda", pieza: "a new automotive front wheel bearing: a double-row sealed ball bearing with polished steel inner and outer rings and black rubber seals, lying at a three-quarter angle", vista: "seen straight from the side, showing the seal and the rings", fabricantes: { FAG: "it is a wheel hub bearing unit with a flange and five wheel studs, seen from the flange side" } },
  // Transmisión
  { prefijo: "Kit de embrague", archivo: "kit-embrague", pieza: "a new automotive clutch kit laid out together: a round steel pressure plate with diaphragm spring fingers, a clutch disc with friction lining and damper springs, and a release bearing", vista: "a close-up of the clutch disc friction lining and its damper springs", fabricantes: { Valeo: "the pressure plate is painted dark green, seen from directly above", LuK: "the pressure plate is zinc plated and the disc is placed leaning against it, seen from a low angle" } },
  { prefijo: "Homocinética", archivo: "homocinetica", pieza: "a new automotive outer CV joint (constant velocity joint): a bell-shaped polished steel housing with a splined stub shaft, a black ribbed rubber boot and two metal boot clamps", vista: "seen from the splined end of the shaft", fabricantes: { SKF: "the boot is dark gray and the housing has a black coating, lying horizontally" } },
  { prefijo: "Aceite de caja", archivo: "aceite-caja", pieza: "a 1 liter plastic bottle of gear oil with a screw cap and a translucent level stripe showing amber oil, with a plain label without any text", vista: "seen from the side, showing the level stripe", fabricantes: { Mobil: "the bottle is dark gray with a red cap" } },
  // Motor
  { prefijo: "Correa poly-V", archivo: "correa-poly-v", pieza: "a new automotive serpentine (poly-V ribbed) accessory belt: a black rubber belt with several longitudinal ribs on the inner side, coiled in a loose loop", vista: "a close-up of the ribbed inner side of the belt", fabricantes: { Contitech: "the belt is laid flat in an oval and has a thin yellow line on the back" } },
  { prefijo: "Termostato", archivo: "termostato", pieza: "a new automotive engine coolant thermostat: a round brass and steel valve with a wax pellet spring mechanism and a black rubber sealing ring", vista: "seen from the spring side, showing the coil spring", fabricantes: { Gates: "it comes inside a black plastic housing with a hose outlet" } },
  { prefijo: "Junta de tapa de cilindros", archivo: "junta-tapa", pieza: "a new automotive multi-layer steel cylinder head gasket for a four-cylinder engine: a thin flat metal sheet with four large round cylinder holes and many small bolt and coolant holes", vista: "a close-up of the edge of one cylinder hole, showing the layered steel", fabricantes: { "Victor Reinz": "it has a dark blue coating, seen at a steeper angle" } },
  { prefijo: "Motor de arranque", archivo: "motor-arranque", pieza: "a new automotive starter motor: a cylindrical black electric motor with a silver solenoid on top, a small pinion gear at the front and a cast aluminum mounting flange", vista: "seen from the front, showing the pinion gear and the mounting flange", fabricantes: { Valeo: "the body is silver gray and the solenoid is black, seen from the other side" } },
  { prefijo: "Alternador", archivo: "alternador", pieza: "a new automotive alternator: a cast aluminum housing with cooling vents, a ribbed pulley at the front and electrical terminals at the back", vista: "seen from the back, showing the electrical terminals and the rear vents", fabricantes: { Valeo: "the housing is dark gray with a black plastic rear cover" } },
  { prefijo: "Motor parcial", archivo: "motor-parcial", pieza: "a remanufactured four-cylinder automotive long block engine on a stand: a cast iron engine block with a cylinder head and valve cover, no intake or exhaust manifolds and no accessories, clean painted surfaces", vista: "seen from the side, showing the block and the cylinder head", fabricantes: {  } },
  // Escape
  { prefijo: "Sonda lambda", archivo: "sonda-lambda", pieza: "a new automotive oxygen (lambda) sensor: a threaded steel body with a hex, a slotted protective tip, and a black cable ending in a plastic electrical connector, lying coiled", vista: "a close-up of the slotted tip and the threads", fabricantes: { NGK: "the cable is gray and the connector is white, the cable lying straight" } },
  { prefijo: "Silenciador", archivo: "silenciador", pieza: "a new automotive rear exhaust muffler: an oval aluminized steel canister with an inlet pipe on one end and a straight tailpipe on the other", vista: "seen from the tailpipe end", fabricantes: { Bosal: "the canister is round and has a matte gray finish" } },
  { prefijo: "Catalizador", archivo: "catalizador", pieza: "a new automotive catalytic converter: a stainless steel oval body with a heat shield and inlet and outlet pipes with mounting flanges", vista: "seen from one end, showing the flange and the honeycomb substrate inside", fabricantes: { Bosal: "the heat shield is matte gray and the pipes are shorter" } },
  // Carrocería
  { prefijo: "Faro trasero", archivo: "faro-trasero", pieza: "a new car rear tail light assembly on its own, not attached to a car: a red and clear polycarbonate lens with separate sections for brake, turn and reverse lights, and a black plastic rear housing", vista: "seen from the back, showing the bulb sockets and the mounting studs", fabricantes: { Hella: "the lens is smoked red with an LED light strip", Depo: "it has a simple red and amber lens, seen straight from the front" } },
  { prefijo: "Espejo retrovisor", archivo: "espejo-retrovisor", pieza: "a new car exterior side mirror assembly on its own, not attached to a car: a black plastic housing with the mirror glass and its mounting base", vista: "seen from the back of the housing and the mounting base", fabricantes: { Fitam: "the housing has an integrated amber turn signal light" } },
  // Eléctrico
  { prefijo: "Kit de fusibles", archivo: "kit-fusibles", pieza: "an assortment of automotive blade fuses in many colors neatly arranged in an open clear plastic case with compartments, with a small fuse puller tool", vista: "a close-up of a few blade fuses of different colors", fabricantes: { Hella: "the case is black with a clear lid and the fuses are mini size" } },
  { prefijo: "Relé", archivo: "rele", pieza: "a single new 12V automotive relay: a small black cube-shaped plastic housing with four metal blade terminals on the bottom and a mounting tab", vista: "seen from below, showing the four blade terminals", fabricantes: { Hella: "the housing is gray, seen from the side" } },
  { prefijo: "Lámpara de faro", archivo: "lampara-faro", pieza: "a new automotive halogen headlight bulb: a clear quartz glass capsule with a visible filament, a metal base with a flange and a plastic connector, lying at an angle", vista: "a close-up of the glass capsule and the filament", fabricantes: { Osram: "the glass capsule has a slightly blue tint, standing upright" } },
  { prefijo: "Lámpara de señal", archivo: "lampara-senal", pieza: "two new small automotive signal bulbs: one small wedge base bulb and one round glass bulb with a metal bayonet base, side by side", vista: "a close-up of the round bulb and its bayonet base", fabricantes: { Osram: "the bulbs lie on their side seen from above" } },
  // Climatización
  { prefijo: "Compresor de aire acondicionado", archivo: "compresor-aire", pieza: "a new automotive air conditioning compressor: a cylindrical cast aluminum body with an electromagnetic clutch and a ribbed pulley at the front and two refrigerant ports on top", vista: "seen from the back, showing the refrigerant ports and the mounting ears", fabricantes: { Valeo: "the body is dark gray, seen from the pulley side", Sanden: "the body is silver and the pulley is black, lying on its side" } },
  // Lubricantes y accesorios
  { prefijo: "Aditivo limpia inyectores", archivo: "aditivo", pieza: "a 300 ml metal can of fuel injector cleaner additive with a screw cap and a plain label without any text", vista: "seen from above at an angle, showing the cap", fabricantes: { "Wynn's": "the can is a red plastic bottle with a long neck" } },
  { prefijo: "Líquido limpiaparabrisas", archivo: "liquido-limpiaparabrisas", pieza: "a 1 liter translucent plastic bottle filled with blue windshield washer fluid, with a screw cap and a plain white label without any text", vista: "seen from the side at a slight angle", fabricantes: { "Liqui Moly": "the bottle is white with a blue cap and a handle" } },
  { prefijo: "Kit de seguridad", archivo: "kit-seguridad", pieza: "a car safety kit laid out: a red reflective warning triangle, a yellow high-visibility vest folded, and a small red 1 kg fire extinguisher, next to a black zip bag", vista: "a close-up of the folded reflective vest and the warning triangle", fabricantes: {  } },
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

/**
 * Las segundas vistas: una por cada imagen principal, desde otro ángulo.
 * `de` es la imagen principal de la que sale (y que va como referencia).
 */
export function vistasEsperadas() {
  return imagenesEsperadas().map((imagen) => ({
    archivo: `${imagen.archivo}-vista`,
    de: imagen.archivo,
    tipo: imagen.tipo,
    fabricante: imagen.fabricante,
  }));
}

/** Las fotos extra del detalle de un repuesto (por ahora, la segunda vista). */
export function imagenesExtraDeTipo(nombre) {
  const principal = imagenDeTipo(nombre);
  return principal ? [principal.replace(/\.webp$/, "-vista.webp")] : [];
}
