// Funciones puras del generador de imágenes (scripts/generar-imagenes.js),
// separadas para poder testearlas sin llamar a la API.

// Nano Banana Pro: el modelo de imágenes de Gemini con más conocimiento
// del mundo real y mejor adherencia al prompt. Se puede cambiar con la
// variable de entorno GEMINI_IMAGE_MODEL (por ejemplo, gemini-nano-banana-2.1,
// que es más barato).
export const MODELO_POR_DEFECTO = "gemini-3-pro-image";
export const TAMANIO_POR_DEFECTO = "2K";
export const URL_API = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const MAX_VARIANTES = 4;

// Mismo estilo para todas: así el catálogo se ve parejo. Se pide fidelidad
// técnica (proporciones y detalles reales) y nada inventado.
export function armarPrompt(pieza, { conReferencia = false } = {}) {
  return [
    `Professional studio product photograph of ${pieza}.`,
    "It must look exactly like the real, commonly sold aftermarket part: correct shape, proportions, materials, colors and mechanical details. Do not invent or add components.",
    conReferencia
      ? "Use the attached reference photo only to match the part's real shape and details; do not copy its background, logos or text."
      : "",
    "Single product, centered, fully visible with some margin, isolated on a pure white background.",
    "Soft even studio lighting, subtle natural shadow, sharp focus, photorealistic, e-commerce catalog style, square composition.",
    "No text, no logos, no brand names, no printed labels with writing, no watermark, no people, no hands, no car.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function armarPedido(modelo, prompt, { referencias = [], tamanio = TAMANIO_POR_DEFECTO } = {}) {
  return {
    model: modelo,
    input: [
      { type: "text", text: prompt },
      ...referencias.map(({ data, mimeType }) => ({ type: "image", data, mime_type: mimeType })),
    ],
    response_format: {
      type: "image",
      mime_type: "image/jpeg",
      aspect_ratio: "1:1",
      image_size: tamanio,
    },
  };
}

// La imagen final de la respuesta, en base64. Los modelos Gemini 3 "piensan"
// y pueden devolver imágenes intermedias en pasos de tipo "thought": esas
// se ignoran y se toma la ÚLTIMA imagen que no esté dentro de uno. Se busca
// en todo el JSON para tolerar las dos formas de la API:
// `{ type: "image", data }` (Interactions) e `inlineData: { data }`
// (generateContent, donde las intermedias traen `thought: true`).
export function extraerImagen(respuesta) {
  let ultima = null;

  const recorrer = (nodo, enPensamiento) => {
    if (!nodo || typeof nodo !== "object") return;
    const pensamiento = enPensamiento || nodo.type === "thought" || nodo.thought === true;

    if (!pensamiento) {
      if (nodo.type === "image" && typeof nodo.data === "string") ultima = nodo.data;
      const enLinea = nodo.inlineData ?? nodo.inline_data;
      if (enLinea && typeof enLinea.data === "string") ultima = enLinea.data;
    }

    Object.values(nodo).forEach((hijo) => recorrer(hijo, pensamiento));
  };

  recorrer(respuesta, false);
  return ultima;
}

// Argumentos de la línea de comandos:
//   --prueba, --forzar, --solo a,b, --variantes N, --elegir <tipo> <N>
export function leerOpciones(argumentos) {
  const opciones = { prueba: false, forzar: false, solo: null, variantes: 1, elegir: null };

  for (let i = 0; i < argumentos.length; i += 1) {
    const argumento = argumentos[i];

    if (argumento === "--prueba") opciones.prueba = true;
    else if (argumento === "--forzar") opciones.forzar = true;
    else if (argumento === "--solo") {
      opciones.solo = (argumentos[i + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      i += 1;
    } else if (argumento === "--variantes") {
      const n = Number(argumentos[i + 1]);
      if (!Number.isInteger(n) || n < 1 || n > MAX_VARIANTES) {
        throw new Error(`--variantes tiene que ser un número entre 1 y ${MAX_VARIANTES}`);
      }
      opciones.variantes = n;
      i += 1;
    } else if (argumento === "--elegir") {
      const archivo = argumentos[i + 1];
      const n = Number(argumentos[i + 2]);
      if (!archivo || !Number.isInteger(n) || n < 1) {
        throw new Error("Uso: --elegir <tipo> <número de variante>, por ejemplo --elegir bujia 2");
      }
      opciones.elegir = { archivo, numero: n };
      i += 2;
    } else {
      throw new Error(`Opción desconocida: ${argumento}`);
    }
  }
  return opciones;
}

// Página para comparar las variantes de cada tipo lado a lado.
export function armarHojaDeContacto(tipos, variantes) {
  const filas = tipos
    .map((tipo) => {
      const celdas = Array.from({ length: variantes }, (_, i) => {
        const n = i + 1;
        return `<figure><img src="${tipo.archivo}-${n}.webp" alt=""><figcaption>${n}</figcaption></figure>`;
      }).join("");
      return `<section><h2>${tipo.archivo} <small>${tipo.prefijo}</small></h2><div>${celdas}</div></section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Candidatas de imágenes</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; background: #f4f4f5; }
  section { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
  h2 { margin: 0 0 12px; font-size: 16px; } small { color: #71717a; font-weight: normal; }
  section > div { display: flex; gap: 12px; flex-wrap: wrap; }
  figure { margin: 0; text-align: center; } img { width: 220px; height: 220px; border: 1px solid #e4e4e7; border-radius: 8px; }
  figcaption { font-weight: bold; margin-top: 4px; }
</style></head><body>
<h1>Elegí una variante por tipo</h1>
<p>Para usar una: <code>npm run imagenes -- --elegir &lt;tipo&gt; &lt;número&gt;</code></p>
${filas}
</body></html>
`;
}
