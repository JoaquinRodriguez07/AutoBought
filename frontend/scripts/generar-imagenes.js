// Genera la imagen de cada tipo de repuesto con la API de imágenes de
// Gemini y la guarda, liviana, en public/repuestos/<archivo>.webp.
//
// Uso (desde frontend/):
//   GEMINI_API_KEY=tu-clave npm run imagenes                 # las que faltan
//   GEMINI_API_KEY=tu-clave npm run imagenes -- --solo bujia,radiador
//   GEMINI_API_KEY=tu-clave npm run imagenes -- --forzar     # todas de nuevo
//   npm run imagenes -- --prueba                             # muestra los prompts, sin llamar a la API
//
// La clave nunca va en el repositorio: se pasa como variable de entorno.
// Opcional: GEMINI_IMAGE_MODEL para usar otro modelo de imágenes.
//
// Las imágenes son genéricas e ilustrativas. Revisarlas antes de subirlas
// y regenerar con --solo las que no se parezcan a la pieza.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { TIPOS_REPUESTO } from "../src/imagenesRepuestos.js";
import {
  MODELO_POR_DEFECTO,
  URL_API,
  armarPedido,
  armarPrompt,
  extraerImagen,
  leerOpciones,
} from "./imagenes-gemini.js";

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "repuestos");
const LADO_PX = 600;
const CALIDAD_WEBP = 80;
const ESPERA_REINTENTO_MS = Number(process.env.GEMINI_ESPERA_MS ?? 20_000);

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

async function pedirImagen(clave, modelo, prompt) {
  for (let intento = 1; intento <= 3; intento += 1) {
    const respuesta = await fetch(process.env.GEMINI_API_URL || URL_API, {
      method: "POST",
      headers: { "x-goog-api-key": clave, "Content-Type": "application/json" },
      body: JSON.stringify(armarPedido(modelo, prompt)),
    });
    const cuerpo = await respuesta.json().catch(() => ({}));

    if (respuesta.ok) {
      const imagen = extraerImagen(cuerpo);
      if (imagen) return Buffer.from(imagen, "base64");
      throw new Error("la respuesta no trae ninguna imagen");
    }

    // 429 (límite de pedidos) o error del servidor: se espera y se reintenta.
    if ((respuesta.status === 429 || respuesta.status >= 500) && intento < 3) {
      console.log(`   ${respuesta.status}: reintento en ${ESPERA_REINTENTO_MS / 1000} s...`);
      await esperar(ESPERA_REINTENTO_MS);
      continue;
    }
    throw new Error(`${respuesta.status}: ${cuerpo.error?.message ?? "error de la API"}`);
  }
  throw new Error("sin respuesta");
}

async function main() {
  const opciones = leerOpciones(process.argv.slice(2));
  const clave = process.env.GEMINI_API_KEY;
  const modelo = process.env.GEMINI_IMAGE_MODEL || MODELO_POR_DEFECTO;

  const desconocidos = (opciones.solo ?? []).filter(
    (archivo) => !TIPOS_REPUESTO.some((tipo) => tipo.archivo === archivo)
  );
  if (desconocidos.length > 0) {
    console.error(`No existen estos tipos: ${desconocidos.join(", ")}`);
    console.error(`Los tipos son: ${TIPOS_REPUESTO.map((tipo) => tipo.archivo).join(", ")}`);
    process.exit(1);
  }

  if (!opciones.prueba && !clave) {
    console.error("Falta GEMINI_API_KEY. Ejemplo: GEMINI_API_KEY=tu-clave npm run imagenes");
    process.exit(1);
  }

  const tipos = TIPOS_REPUESTO.filter((tipo) => {
    if (opciones.solo) return opciones.solo.includes(tipo.archivo);
    return opciones.forzar || !existsSync(join(CARPETA, `${tipo.archivo}.webp`));
  });

  if (tipos.length === 0) {
    console.log("Todos los tipos ya tienen imagen. Usá --forzar o --solo para regenerar.");
    return;
  }

  if (opciones.prueba) {
    for (const tipo of tipos) console.log(`${tipo.archivo}.webp\n   ${armarPrompt(tipo.pieza)}\n`);
    return;
  }

  // sharp se carga solo cuando se generan imágenes de verdad.
  const { default: sharp } = await import("sharp");
  mkdirSync(CARPETA, { recursive: true });

  console.log(`Modelo: ${modelo}. Imágenes a generar: ${tipos.length}.\n`);
  const fallidos = [];

  for (const tipo of tipos) {
    process.stdout.write(`- ${tipo.archivo}... `);
    try {
      const original = await pedirImagen(clave, modelo, armarPrompt(tipo.pieza));
      const webp = await sharp(original)
        .resize(LADO_PX, LADO_PX, { fit: "contain", background: "#ffffff" })
        .webp({ quality: CALIDAD_WEBP })
        .toBuffer();
      writeFileSync(join(CARPETA, `${tipo.archivo}.webp`), webp);
      console.log(`listo (${Math.round(webp.length / 1024)} KB)`);
    } catch (error) {
      console.log(`falló: ${error.message}`);
      fallidos.push(tipo.archivo);
    }
  }

  console.log(`\nImágenes en ${CARPETA}`);
  if (fallidos.length > 0) {
    console.log(`Fallaron: ${fallidos.join(", ")}. Reintentar con: npm run imagenes -- --solo ${fallidos.join(",")}`);
    process.exit(1);
  }
}

main();
