import {
  MAX_VARIANTES,
  MODELO_POR_DEFECTO,
  armarHojaDeContacto,
  armarPedido,
  armarPrompt,
  armarPromptFabricante,
  armarPromptVista,
  extraerImagen,
  leerOpciones,
} from "./imagenes-gemini";

describe("armarPrompt", () => {
  it("asks for a faithful white-background product photo without brands", () => {
    const prompt = armarPrompt("a single automotive spark plug");

    expect(prompt).toContain("a single automotive spark plug");
    expect(prompt).toContain("exactly like the real");
    expect(prompt).toContain("pure white background");
    expect(prompt).toContain("no logos");
    expect(prompt).not.toContain("reference photo");
  });

  it("mentions the reference photo only when there is one", () => {
    expect(armarPrompt("a radiator", { conReferencia: true })).toContain("reference photo");
  });
});

describe("armarPromptFabricante", () => {
  it("starts from the base image and changes only the manufacturer's colors and angle", () => {
    const prompt = armarPromptFabricante("a car battery", "the case is light gray, seen from above");

    expect(prompt).toContain("attached reference product photo as the base");
    expect(prompt).toContain("the case is light gray, seen from above");
    expect(prompt).toContain("same lighting, pure white background");
    expect(prompt).toContain("no logos");
  });
});

describe("armarPromptVista", () => {
  it("asks for the same object from another angle without changing anything else", () => {
    const prompt = armarPromptVista("seen from above");

    expect(prompt).toContain("exactly the same physical object, seen from above");
    expect(prompt).toContain("Only the camera angle changes");
    expect(prompt).toContain("do not change the color");
    expect(prompt).toContain("only source of truth");
    expect(prompt).toContain("no logos");
  });
});

describe("armarPedido", () => {
  it("requests one square 2K image from Nano Banana Pro by default", () => {
    expect(armarPedido(MODELO_POR_DEFECTO, "texto")).toEqual({
      model: "gemini-3-pro-image",
      input: [{ type: "text", text: "texto" }],
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
        aspect_ratio: "1:1",
        image_size: "2K",
      },
    });
  });

  it("attaches the reference images after the text", () => {
    const pedido = armarPedido("modelo-x", "texto", {
      referencias: [{ data: "QUJD", mimeType: "image/png" }],
      tamanio: "1K",
    });

    expect(pedido.input).toEqual([
      { type: "text", text: "texto" },
      { type: "image", data: "QUJD", mime_type: "image/png" },
    ]);
    expect(pedido.response_format.image_size).toBe("1K");
  });
});

describe("extraerImagen", () => {
  it("takes the final image and skips the interim thought images", () => {
    const respuesta = {
      steps: [
        { type: "thought", content: [{ type: "image", data: "BORRADOR" }] },
        { type: "model_output", content: [{ type: "text", text: "Acá está" }, { type: "image", data: "FINAL" }] },
      ],
    };

    expect(extraerImagen(respuesta)).toBe("FINAL");
  });

  it("also understands the generateContent shape", () => {
    const respuesta = {
      candidates: [{
        content: {
          parts: [
            { thought: true, inlineData: { mimeType: "image/png", data: "BORRADOR" } },
            { inlineData: { mimeType: "image/png", data: "FINAL" } },
          ],
        },
      }],
    };

    expect(extraerImagen(respuesta)).toBe("FINAL");
  });

  it("returns null when there is no final image", () => {
    expect(extraerImagen({ steps: [{ type: "thought", content: [{ type: "image", data: "X" }] }] })).toBeNull();
    expect(extraerImagen({ steps: [{ content: [{ type: "text", text: "no puedo" }] }] })).toBeNull();
    expect(extraerImagen(null)).toBeNull();
  });
});

describe("leerOpciones", () => {
  it("reads the flags, the list of types and the variants", () => {
    expect(leerOpciones(["--forzar", "--solo", "bujia, radiador", "--variantes", "3"])).toEqual({
      prueba: false,
      forzar: true,
      vistas: false,
      solo: ["bujia", "radiador"],
      variantes: 3,
      elegir: null,
    });
    expect(leerOpciones(["--prueba"])).toMatchObject({ prueba: true, variantes: 1 });
  });

  it("switches to the second views", () => {
    expect(leerOpciones(["--vistas", "--solo", "bateria-vista"])).toMatchObject({ vistas: true, solo: ["bateria-vista"] });
  });

  it("reads which variant to keep", () => {
    expect(leerOpciones(["--elegir", "bujia", "2"]).elegir).toEqual({ archivo: "bujia", numero: 2 });
  });

  it("rejects invalid options", () => {
    expect(() => leerOpciones(["--todo"])).toThrow("Opción desconocida: --todo");
    expect(() => leerOpciones(["--variantes", String(MAX_VARIANTES + 1)])).toThrow("--variantes");
    expect(() => leerOpciones(["--elegir", "bujia"])).toThrow("Uso: --elegir");
  });
});

describe("armarHojaDeContacto", () => {
  it("shows every variant of every type", () => {
    const html = armarHojaDeContacto([{ archivo: "bujia", prefijo: "Bujía" }], 2);

    expect(html).toContain('src="bujia-1.webp"');
    expect(html).toContain('src="bujia-2.webp"');
    expect(html).toContain("--elegir");
  });
});
