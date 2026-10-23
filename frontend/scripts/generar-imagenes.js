// Genera la imagen de cada tipo de repuesto con la API de imágenes de
// Gemini y la guarda, liviana, en public/repuestos/<archivo>.webp.
//
// Uso (desde frontend/):
//   GEMINI_API_KEY=tu-clave npm run imagenes                      # las que faltan
//   GEMINI_API_KEY=tu-clave npm run imagenes -- --solo bujia,radiador
//   GEMINI_API_KEY=tu-clave npm run imagenes -- --forzar          # todas de nuevo
//   GEMINI_API_KEY=tu-clave npm run imagenes -- --variantes 3     # 3 opciones por tipo, para elegir
//   npm run imagenes -- --elegir bujia 2                          # usar la variante 2 de bujia
//   npm run imagenes -- --prueba                                  # ver los prompts, sin llamar a la API
//
// Con --variantes, las opciones quedan en imagenes-candidatas/ (no se sube
// al repo) junto con un index.html para compararlas, y se elige una por
// tipo con --elegir.
//
// Referencias (opcional, para más fidelidad): si existe
// imagenes-referencia/<archivo>.jpg (o .png / .webp), se manda como foto de
// referencia de la pieza real. Usar fotos propias o con licencia libre;
// esa carpeta tampoco se sube.
//
// La clave nunca va en el repositorio: se pasa como variable de entorno.
// Opcionales: GEMINI_IMAGE_MODEL (otro modelo) y GEMINI_IMAGE_SIZE (1K/2K/4K).

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { TIPOS_REPUESTO } from "../src/imagenesRepuestos.js";
import {
  MODELO_POR_DEFECTO,
  TAMANIO_POR_DEFECTO,
  URL_API,
  armarHojaDeContacto,
  armarPedido,
  armarPrompt,
  extraerImagen,
  leerOpciones,
} from "./imagenes-gemini.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARPETA = join(RAIZ, "public", "repuestos");
const CANDIDATAS = join(RAIZ, "imagenes-candidatas");
const REFERENCIAS = join(RAIZ, "imagenes-referencia");
const LADO_PX = 600;
const CALIDAD_WEBP = 82;
const ESPERA_REINTENTO_MS = Number(process.env.GEMINI_ESPERA_MS ?? 20_000);
const TIPOS_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const salirConError = (mensaje) => {
  console.error(mensaje);
  process.exit(1);
};

function referenciaDe(tipo) {
  for (const [extension, mimeType] of Object.entries(TIPOS_MIME)) {
    const ruta = join(REFERENCIAS, `${tipo.archivo}.${extension}`);
    if (existsSync(ruta)) return { data: readFileSync(ruta).toString("base64"), mimeType };
  }
  return null;
}

async function pedirImagen(clave, pedido) {
  for (let intento = 1; intento <= 3; intento += 1) {
    const respuesta = await fetch(process.env.GEMINI_API_URL || URL_API, {
      method: "POST",
      headers: { "x-goog-api-key": clave, "Content-Type": "application/json" },
      body: JSON.stringify(pedido),
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

function elegir({ archivo, numero }) {
  const origen = join(CANDIDATAS, `${archivo}-${numero}.webp`);
  if (!existsSync(origen)) salirConError(`No existe ${origen}. Generá primero con --variantes.`);
  mkdirSync(CARPETA, { recursive: true });
  copyFileSync(origen, join(CARPETA, `${archivo}.webp`));
  console.log(`Listo: public/repuestos/${archivo}.webp es la variante ${numero}.`);
}

async function main() {
  const opciones = leerOpciones(process.argv.slice(2));
  const clave = process.env.GEMINI_API_KEY;
  const modelo = process.env.GEMINI_IMAGE_MODEL || MODELO_POR_DEFECTO;
  const tamanio = process.env.GEMINI_IMAGE_SIZE || TAMANIO_POR_DEFECTO;

  const pedidos = [...(opciones.solo ?? []), ...(opciones.elegir ? [opciones.elegir.archivo] : [])];
  const desconocidos = pedidos.filter((archivo) => !TIPOS_REPUESTO.some((tipo) => tipo.archivo === archivo));
  if (desconocidos.length > 0) {
    salirConError(
      `No existen estos tipos: ${desconocidos.join(", ")}\n` +
        `Los tipos son: ${TIPOS_REPUESTO.map((tipo) => tipo.archivo).join(", ")}`
    );
  }

  if (opciones.elegir) return elegir(opciones.elegir);

  if (!opciones.prueba && !clave) {
    salirConError("Falta GEMINI_API_KEY. Ejemplo: GEMINI_API_KEY=tu-clave npm run imagenes");
  }

  const conVariantes = opciones.variantes > 1;
  const tipos = TIPOS_REPUESTO.filter((tipo) => {
    if (opciones.solo) return opciones.solo.includes(tipo.archivo);
    if (conVariantes) return true;
    return opciones.forzar || !existsSync(join(CARPETA, `${tipo.archivo}.webp`));
  });

  if (tipos.length === 0) {
    console.log("Todos los tipos ya tienen imagen. Usá --forzar, --solo o --variantes para regenerar.");
    return;
  }

  if (opciones.prueba) {
    for (const tipo of tipos) {
      const referencia = referenciaDe(tipo) ? " (con foto de referencia)" : "";
      console.log(`${tipo.archivo}${referencia}\n   ${armarPrompt(tipo.pieza, { conReferencia: !!referencia })}\n`);
    }
    return;
  }

  // sharp se carga solo cuando se generan imágenes de verdad.
  const { default: sharp } = await import("sharp");
  const destino = conVariantes ? CANDIDATAS : CARPETA;
  mkdirSync(destino, { recursive: true });

  const total = tipos.length * opciones.variantes;
  console.log(`Modelo: ${modelo} (${tamanio}). Imágenes a generar: ${total}.\n`);
  const fallidos = [];

  for (const tipo of tipos) {
    const referencia = referenciaDe(tipo);
    const pedido = armarPedido(modelo, armarPrompt(tipo.pieza, { conReferencia: !!referencia }), {
      referencias: referencia ? [referencia] : [],
      tamanio,
    });

    for (let n = 1; n <= opciones.variantes; n += 1) {
      const nombre = conVariantes ? `${tipo.archivo}-${n}` : tipo.archivo;
      process.stdout.write(`- ${nombre}${referencia ? " (con referencia)" : ""}... `);
      try {
        const original = await pedirImagen(clave, pedido);
        const webp = await sharp(original)
          .resize(LADO_PX, LADO_PX, { fit: "contain", background: "#ffffff" })
          .webp({ quality: CALIDAD_WEBP })
          .toBuffer();
        writeFileSync(join(destino, `${nombre}.webp`), webp);
        console.log(`listo (${Math.round(webp.length / 1024)} KB)`);
      } catch (error) {
        console.log(`falló: ${error.message}`);
        fallidos.push(tipo.archivo);
      }
    }
  }

  if (conVariantes) {
    writeFileSync(join(CANDIDATAS, "index.html"), armarHojaDeContacto(tipos, opciones.variantes));
    console.log(`\nAbrí ${join(CANDIDATAS, "index.html")} para compararlas y elegí con:`);
    console.log("   npm run imagenes -- --elegir <tipo> <número>");
  } else {
    console.log(`\nImágenes en ${CARPETA}`);
  }

  if (fallidos.length > 0) {
    const unicos = [...new Set(fallidos)];
    salirConError(`Fallaron: ${unicos.join(", ")}. Reintentar con: --solo ${unicos.join(",")}`);
  }
}

main();
