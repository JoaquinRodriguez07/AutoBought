// Funciones puras del generador de imágenes (scripts/generar-imagenes.js),
// separadas para poder testearlas sin llamar a la API.

export const MODELO_POR_DEFECTO = "gemini-nano-banana-2.1";
export const URL_API = "https://generativelanguage.googleapis.com/v1beta/interactions";

// Mismo estilo para todas: así el catálogo se ve parejo.
export function armarPrompt(pieza) {
  return [
    `Studio product photograph of ${pieza}.`,
    "Single object, centered, fully visible, isolated on a pure white background.",
    "Soft even lighting, subtle shadow, sharp focus, realistic, e-commerce catalog style, square composition.",
    "No text, no logos, no brand names, no labels with writing, no watermark, no people, no hands.",
  ].join(" ");
}

export function armarPedido(modelo, prompt) {
  return {
    model: modelo,
    input: [{ type: "text", text: prompt }],
    response_format: {
      type: "image",
      mime_type: "image/jpeg",
      aspect_ratio: "1:1",
      image_size: "1K",
    },
  };
}

// Busca la primera imagen en base64 de la respuesta. Se busca en todo el
// JSON en vez de en un camino fijo para tolerar las dos formas de la API:
// `{ type: "image", data }` (Interactions) e `inlineData: { data }`
// (generateContent).
export function extraerImagen(respuesta) {
  const pendientes = [respuesta];
  while (pendientes.length > 0) {
    const nodo = pendientes.shift();
    if (!nodo || typeof nodo !== "object") continue;

    if (nodo.type === "image" && typeof nodo.data === "string") return nodo.data;
    const enLinea = nodo.inlineData ?? nodo.inline_data;
    if (enLinea && typeof enLinea.data === "string") return enLinea.data;

    pendientes.push(...Object.values(nodo));
  }
  return null;
}

// Argumentos de la línea de comandos: --prueba, --forzar y --solo a,b.
export function leerOpciones(argumentos) {
  const opciones = { prueba: false, forzar: false, solo: null };
  for (let i = 0; i < argumentos.length; i += 1) {
    const argumento = argumentos[i];
    if (argumento === "--prueba") opciones.prueba = true;
    else if (argumento === "--forzar") opciones.forzar = true;
    else if (argumento === "--solo") {
      opciones.solo = (argumentos[i + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      i += 1;
    } else {
      throw new Error(`Opción desconocida: ${argumento}`);
    }
  }
  return opciones;
}
