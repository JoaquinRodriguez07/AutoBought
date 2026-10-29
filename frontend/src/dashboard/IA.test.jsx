import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("./apiDashboard");

import PreguntarDashboard from "./PreguntarDashboard";
import ResumenIA from "./ResumenIA";
import { actualizarResumenIA, funcionSinPublicar, obtenerResumenIA, preguntarAlDashboard } from "./apiDashboard";

const conStatus = (status) => Object.assign(new Error("falló"), { status });

const resumen = {
  puntos: [
    "Las ventas de octubre vienen un 12 % arriba de septiembre.",
    "Encendido es la categoría que más creció.",
    "Reponé primero la Batería Moura (6 días de stock).",
  ],
  generado: "2026-10-29T09:30:00-03:00",
};

beforeEach(() => {
  funcionSinPublicar.mockImplementation(jest.requireActual("./apiDashboard").funcionSinPublicar);
});

afterEach(() => jest.clearAllMocks());

describe("resumen con IA (HU 6.3)", () => {
  it("shows the summary points with the date it was generated", async () => {
    obtenerResumenIA.mockResolvedValue(resumen);
    render(<ResumenIA />);

    await screen.findByText(resumen.puntos[0]);
    const panel = screen.getByRole("region", { name: "Resumen del día" });
    const puntos = within(panel).getAllByRole("listitem");
    expect(puntos).toHaveLength(3);
    expect(puntos[2]).toHaveTextContent("Reponé primero la Batería Moura");
    expect(within(panel).getByText(/Generado el 29 de octubre de 2026/)).toBeInTheDocument();
  });

  it("generates a new one with Actualizar", async () => {
    const user = userEvent.setup();
    obtenerResumenIA.mockResolvedValue(resumen);
    actualizarResumenIA.mockResolvedValue({ ...resumen, puntos: ["Un resumen nuevo."] });
    render(<ResumenIA />);

    await user.click(await screen.findByRole("button", { name: "Actualizar" }));

    expect(await screen.findByText("Un resumen nuevo.")).toBeInTheDocument();
    expect(actualizarResumenIA).toHaveBeenCalledTimes(1);
  });

  it("warns when the AI does not answer", async () => {
    obtenerResumenIA.mockRejectedValue(conStatus(503));
    render(<ResumenIA />);

    expect(await screen.findByText(/El resumen no está disponible en este momento/)).toBeInTheDocument();
  });

  it("says it is in development while the backend does not have it", async () => {
    obtenerResumenIA.mockRejectedValue(conStatus(404));
    render(<ResumenIA />);

    expect(await screen.findByText("En desarrollo")).toBeInTheDocument();
    expect(screen.getByText(/Estamos desarrollando un resumen escrito/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actualizar" })).not.toBeInTheDocument();
  });
});

describe("preguntarle al dashboard (HU 6.4)", () => {
  it("asks a suggested question and shows the answer with the data used", async () => {
    const user = userEvent.setup();
    preguntarAlDashboard.mockResolvedValue({
      respuesta: "Frenos vendió 320 unidades en julio.",
      datos: { columnas: ["Categoría", "Unidades"], filas: [["Frenos", 320], ["Filtros", 210]] },
    });
    render(<PreguntarDashboard disponible />);

    const sugeridas = screen.getByRole("list", { name: "Preguntas sugeridas" });
    await user.click(within(sugeridas).getByRole("button", { name: "¿Qué categoría vendió más en julio?" }));

    expect(preguntarAlDashboard).toHaveBeenCalledWith("¿Qué categoría vendió más en julio?");
    expect(await screen.findByText("Frenos vendió 320 unidades en julio.")).toBeInTheDocument();
    await user.click(screen.getByText("Ver los datos que se usaron"));
    expect(screen.getByRole("table")).toHaveTextContent("Filtros210");
  });

  it("asks what the seller types", async () => {
    const user = userEvent.setup();
    preguntarAlDashboard.mockResolvedValue({ respuesta: "No tengo esa información.", datos: null });
    render(<PreguntarDashboard disponible />);

    expect(screen.getByRole("button", { name: "Preguntar" })).toBeDisabled();
    await user.type(screen.getByLabelText("Tu pregunta"), "¿Qué opinan los clientes?");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));

    expect(await screen.findByText("No tengo esa información.")).toBeInTheDocument();
    expect(screen.queryByText("Ver los datos que se usaron")).not.toBeInTheDocument();
  });

  it("warns when the AI does not answer", async () => {
    const user = userEvent.setup();
    preguntarAlDashboard.mockRejectedValue(conStatus(503));
    render(<PreguntarDashboard disponible />);

    await user.type(screen.getByLabelText("Tu pregunta"), "¿Cómo vienen las ventas?");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));

    expect(await screen.findByText(/No pudimos responder ahora/)).toBeInTheDocument();
  });

  it("says it is in development and does not let the seller ask while the backend does not have it", () => {
    render(<PreguntarDashboard />);

    expect(screen.getByText("En desarrollo")).toBeInTheDocument();
    expect(screen.getByLabelText("Tu pregunta")).toBeDisabled();
    expect(screen.getByRole("button", { name: "¿Cómo vienen las ventas de Frenos?" })).toBeDisabled();
    expect(preguntarAlDashboard).not.toHaveBeenCalled();
  });
});
