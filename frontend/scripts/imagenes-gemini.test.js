import {
  armarPedido,
  armarPrompt,
  extraerImagen,
  leerOpciones,
} from "./imagenes-gemini";

describe("armarPrompt", () => {
  it("asks for a white-background product photo without brands", () => {
    const prompt = armarPrompt("a single automotive spark plug");

    expect(prompt).toContain("a single automotive spark plug");
    expect(prompt).toContain("pure white background");
    expect(prompt).toContain("no logos");
  });
});

describe("armarPedido", () => {
  it("requests one square image from the chosen model", () => {
    expect(armarPedido("modelo-x", "texto")).toEqual({
      model: "modelo-x",
      input: [{ type: "text", text: "texto" }],
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
        aspect_ratio: "1:1",
        image_size: "1K",
      },
    });
  });
});

describe("extraerImagen", () => {
  it("finds the image block of an Interactions response", () => {
    const respuesta = {
      steps: [
        { type: "thought", content: [{ type: "text", text: "..." }] },
        { type: "model_output", content: [{ type: "image", mime_type: "image/jpeg", data: "QUJD" }] },
      ],
    };

    expect(extraerImagen(respuesta)).toBe("QUJD");
  });

  it("also understands the generateContent shape", () => {
    const respuesta = {
      candidates: [{ content: { parts: [{ text: "hola" }, { inlineData: { mimeType: "image/png", data: "WFla" } }] } }],
    };

    expect(extraerImagen(respuesta)).toBe("WFla");
  });

  it("returns null when there is no image", () => {
    expect(extraerImagen({ steps: [{ content: [{ type: "text", text: "no puedo" }] }] })).toBeNull();
    expect(extraerImagen(null)).toBeNull();
  });
});

describe("leerOpciones", () => {
  it("reads the flags and the list of types", () => {
    expect(leerOpciones(["--forzar", "--solo", "bujia, radiador"])).toEqual({
      prueba: false,
      forzar: true,
      solo: ["bujia", "radiador"],
    });
    expect(leerOpciones(["--prueba"])).toEqual({ prueba: true, forzar: false, solo: null });
  });

  it("rejects unknown options", () => {
    expect(() => leerOpciones(["--todo"])).toThrow("Opción desconocida: --todo");
  });
});
