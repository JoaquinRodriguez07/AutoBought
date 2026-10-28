// Genera las imágenes de los repuestos con la API de imágenes de Gemini y
// las guarda, livianas, en public/repuestos/<archivo>.webp: la base de cada
// tipo de pieza y, a partir de ella, la versión de cada fabricante (ver
// src/imagenesRepuestos.js). Sin opciones genera solo las que faltan, y
// siempre las bases antes que las de fabricante.
//
// Uso (desde frontend/):
//   GEMINI_API_KEY=tu-clave npm run imagenes                      # las que faltan
//   GEMINI_API_KEY=tu-clave npm run imagenes -- --solo bujia,bateria-bosch
//   GEMINI_API_KEY=tu-clave npm run imagenes -- --forzar          # todas de nuevo
//   GEMINI_API_KEY=tu-clave npm run imagenes -- --variantes 3     # 3 opciones por tipo, para elegir
//   npm run imagenes -- --elegir bujia 2                          # usar la variante 2 de bujia
//   npm run imagenes -- --prueba                                  # ver los prompts, sin llamar a la API
//   GEMINI_API_KEY=tu-clave npm run imagenes -- --vistas          # segunda vista (otro ángulo) de cada imagen
//
// --vistas trabaja sobre las segundas vistas (<archivo>-vista.webp) en vez
// de las imágenes principales: cada una sale de su imagen principal, que va
// como referencia, y admite las mismas opciones (--solo, --variantes...).
//
// Con --variantes, las opciones quedan en imagenes-candidatas/ (no se sube
// al repo) junto con un index.html para compararlas, y se elige una por
// tipo con --elegir.
//
// Originales: la web usa la versión de 600 px, pero la imagen tal como la
// devuelve el modelo (2K) se guarda en imagenes-originales/<tipo>.jpg, para
// usarla después como base de los modelos 3D. Con --variantes se guarda la
// de la variante elegida. Tampoco se sube al repo.
//
// Referencias (opcional, para más fidelidad): si existe
// imagenes-referencia/<archivo>.jpg (o .png / .webp), se manda como foto de
// referencia de la pieza real. Usar fotos propias o con licencia libre;
// esa carpeta tampoco se sube.
//
// La clave nunca va en el repositorio. Si no está en GEMINI_API_KEY, el
// script la pide al arrancar, sin mostrarla en pantalla.
// Opcionales: GEMINI_IMAGE_MODEL (otro modelo) y GEMINI_IMAGE_SIZE (1K/2K/4K).

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { imagenesEsperadas, vistasEsperadas } from "../src/imagenesRepuestos.js";
import {
  MODELO_POR_DEFECTO,
  TAMANIO_POR_DEFECTO,
  URL_API,
  armarHojaDeContacto,
  armarPedido,
  armarPrompt,
  armarPromptFabricante,
  armarPromptVista,
  extraerImagen,
  leerOpciones,
} from "./imagenes-gemini.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARPETA = join(RAIZ, "public", "repuestos");
const CANDIDATAS = join(RAIZ, "imagenes-candidatas");
const REFERENCIAS = join(RAIZ, "imagenes-referencia");
const ORIGINALES = join(RAIZ, "imagenes-originales");
const LADO_PX = 600;
const CALIDAD_WEBP = 82;
const ESPERA_REINTENTO_MS = Number(process.env.GEMINI_ESPERA_MS ?? 20_000);
const TIPOS_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const salirConError = (mensaje) => {
  console.error(mensaje);
  process.exit(1);
};

/**
 * Pide la clave en la terminal sin mostrarla: no se ve al escribirla ni al
 * pegarla, y no queda en el historial de comandos (como sí pasa con
 * `GEMINI_API_KEY=... npm run imagenes`).
 *
 * La terminal pasa a "modo crudo": cada tecla llega acá en vez de
 * escribirse en pantalla. Enter termina, Ctrl+C cancela y Retroceso borra.
 * Sin terminal (por ejemplo, en el CI) devuelve una clave vacía.
 */
function pedirClaveOculta(pregunta) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) return Promise.resolve("");

  return new Promise((resolver) => {
    let escrito = "";
    const alEscribir = (texto) => {
      for (const caracter of texto) {
        if (caracter === "\r" || caracter === "\n") return terminar();
        if (caracter === "\u0003") {
          stdin.setRawMode(false);
          stdout.write("\n");
          process.exit(130);
        }
        if (caracter === "\u007f" || caracter === "\b") escrito = escrito.slice(0, -1);
        else escrito += caracter;
      }
    };
    const terminar = () => {
      stdin.off("data", alEscribir);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      // Algunas terminales envuelven lo pegado entre \x1b[200~ y \x1b[201~;
      // eso y cualquier otro carácter de control no son parte de la clave.
      // oxlint-disable-next-line no-control-regex
      resolver(escrito.replace(/\u001b\[[0-9;]*~/g, "").replace(/[\u0000-\u001f\u007f]/g, "").trim());
    };

    stdout.write(pregunta);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", alEscribir);
  });
}

function buscarImagen(carpeta, archivo) {
  for (const [extension, mimeType] of Object.entries(TIPOS_MIME)) {
    const ruta = join(carpeta, `${archivo}.${extension}`);
    if (existsSync(ruta)) return { data: readFileSync(ruta).toString("base64"), mimeType };
  }
  return null;
}

// Base de un tipo: foto real opcional de imagenes-referencia/.
// Versión de un fabricante: la imagen base del tipo (la original en 2K si
// está; si no, la de la web).
function referenciaDe(objetivo) {
  // Segunda vista: su imagen principal (la original en 2K si está).
  if (objetivo.de) return buscarImagen(ORIGINALES, objetivo.de) ?? buscarImagen(CARPETA, objetivo.de);
  if (!objetivo.fabricante) return buscarImagen(REFERENCIAS, objetivo.archivo);
  return buscarImagen(ORIGINALES, objetivo.tipo.archivo) ?? buscarImagen(CARPETA, objetivo.tipo.archivo);
}

function promptDe(objetivo, referencia) {
  if (objetivo.de) return armarPromptVista(objetivo.tipo.vista);
  return objetivo.fabricante
    ? armarPromptFabricante(objetivo.tipo.pieza, objetivo.cambio)
    : armarPrompt(objetivo.tipo.pieza, { conReferencia: !!referencia });
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

// La extensión según el formato real de lo que devolvió el modelo.
async function extensionDe(sharp, imagen) {
  const { format } = await sharp(imagen).metadata();
  return format === "jpeg" ? "jpg" : format;
}

function originalDeCandidata(archivo, numero) {
  for (const extension of ["jpg", "png", "webp"]) {
    const ruta = join(CANDIDATAS, `${archivo}-${numero}-original.${extension}`);
    if (existsSync(ruta)) return { ruta, extension };
  }
  return null;
}

function elegir({ archivo, numero }) {
  const origen = join(CANDIDATAS, `${archivo}-${numero}.webp`);
  if (!existsSync(origen)) salirConError(`No existe ${origen}. Generá primero con --variantes.`);
  mkdirSync(CARPETA, { recursive: true });
  copyFileSync(origen, join(CARPETA, `${archivo}.webp`));

  const original = originalDeCandidata(archivo, numero);
  if (original) {
    mkdirSync(ORIGINALES, { recursive: true });
    copyFileSync(original.ruta, join(ORIGINALES, `${archivo}.${original.extension}`));
  }
  console.log(
    `Listo: public/repuestos/${archivo}.webp es la variante ${numero}` +
      (original ? ` (original en imagenes-originales/${archivo}.${original.extension}).` : ".")
  );
}

async function main() {
  const opciones = leerOpciones(process.argv.slice(2));
  let clave = process.env.GEMINI_API_KEY;
  const modelo = process.env.GEMINI_IMAGE_MODEL || MODELO_POR_DEFECTO;
  const tamanio = process.env.GEMINI_IMAGE_SIZE || TAMANIO_POR_DEFECTO;

  const esperadas = opciones.vistas ? vistasEsperadas() : imagenesEsperadas();
  const pedidos = [...(opciones.solo ?? []), ...(opciones.elegir ? [opciones.elegir.archivo] : [])];
  const desconocidos = pedidos.filter((archivo) => !esperadas.some((objetivo) => objetivo.archivo === archivo));
  if (desconocidos.length > 0) {
    salirConError(
      `No existen estas imágenes: ${desconocidos.join(", ")}\n` +
        `Las imágenes son: ${esperadas.map((objetivo) => objetivo.archivo).join(", ")}`
    );
  }

  if (opciones.elegir) return elegir(opciones.elegir);

  if (!opciones.prueba && !clave) {
    clave = await pedirClaveOculta("Clave de Gemini (no se ve mientras la pegás; Enter para seguir): ");
    if (!clave) {
      salirConError("Falta la clave de Gemini: pegala cuando la pida, o pasala en GEMINI_API_KEY.");
    }
  }

  const conVariantes = opciones.variantes > 1;
  // Las bases primero: las de fabricante las usan como referencia.
  const objetivos = esperadas.filter((objetivo) => {
    if (opciones.solo) return opciones.solo.includes(objetivo.archivo);
    if (conVariantes) return true;
    return opciones.forzar || !existsSync(join(CARPETA, `${objetivo.archivo}.webp`));
  });

  if (objetivos.length === 0) {
    console.log("Ya están todas las imágenes. Usá --forzar, --solo o --variantes para regenerar.");
    return;
  }

  if (opciones.prueba) {
    for (const objetivo of objetivos) {
      const referencia = referenciaDe(objetivo);
      const nota = objetivo.de
        ? ` (a partir de ${objetivo.de})`
        : objetivo.fabricante
          ? " (a partir de la base)"
          : referencia
            ? " (con foto de referencia)"
            : "";
      console.log(`${objetivo.archivo}${nota}\n   ${promptDe(objetivo, referencia)}\n`);
    }
    return;
  }

  // sharp se carga solo cuando se generan imágenes de verdad.
  const { default: sharp } = await import("sharp");
  const destino = conVariantes ? CANDIDATAS : CARPETA;
  mkdirSync(destino, { recursive: true });
  mkdirSync(conVariantes ? CANDIDATAS : ORIGINALES, { recursive: true });

  const total = objetivos.length * opciones.variantes;
  console.log(`Modelo: ${modelo} (${tamanio}). Imágenes a generar: ${total}.\n`);
  const fallidos = [];

  for (const objetivo of objetivos) {
    const referencia = referenciaDe(objetivo);
    if ((objetivo.de || objetivo.fabricante) && !referencia) {
      const falta = objetivo.de ?? objetivo.tipo.archivo;
      console.log(`- ${objetivo.archivo}... falta la imagen ${falta}: generala primero.`);
      fallidos.push(objetivo.archivo);
      continue;
    }
    const pedido = armarPedido(modelo, promptDe(objetivo, referencia), {
      referencias: referencia ? [referencia] : [],
      tamanio,
    });

    for (let n = 1; n <= opciones.variantes; n += 1) {
      const nombre = conVariantes ? `${objetivo.archivo}-${n}` : objetivo.archivo;
      process.stdout.write(`- ${nombre}${referencia ? " (con referencia)" : ""}... `);
      try {
        const original = await pedirImagen(clave, pedido);
        const webp = await sharp(original)
          .resize(LADO_PX, LADO_PX, { fit: "contain", background: "#ffffff" })
          .webp({ quality: CALIDAD_WEBP })
          .toBuffer();
        writeFileSync(join(destino, `${nombre}.webp`), webp);

        // La original en alta resolución, para el 3D.
        const extension = await extensionDe(sharp, original);
        const rutaOriginal = conVariantes
          ? join(CANDIDATAS, `${nombre}-original.${extension}`)
          : join(ORIGINALES, `${objetivo.archivo}.${extension}`);
        writeFileSync(rutaOriginal, original);
        console.log(`listo (${Math.round(webp.length / 1024)} KB)`);
      } catch (error) {
        console.log(`falló: ${error.message}`);
        fallidos.push(objetivo.archivo);
      }
    }
  }

  if (conVariantes) {
    const filas = objetivos.map((objetivo) => ({
      archivo: objetivo.archivo,
      prefijo:
        (objetivo.fabricante ? `${objetivo.tipo.prefijo} · ${objetivo.fabricante}` : objetivo.tipo.prefijo) +
        (objetivo.de ? " · segunda vista" : ""),
    }));
    writeFileSync(join(CANDIDATAS, "index.html"), armarHojaDeContacto(filas, opciones.variantes));
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
