// Tests de las secciones del dashboard con IA.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("./dashboardApi");

import AskDashboard from "./AskDashboard";
import AISummary from "./AISummary";
import { refreshAISummary, unpublishedFeature, getAISummary, askDashboard } from "./dashboardApi";

const withStatus = (status) => Object.assign(new Error("falló"), { status });

const summary = {
  puntos: [
    "Las ventas de octubre vienen un 12 % arriba de septiembre.",
    "Encendido es la categoría que más creció.",
    "Reponé primero la Batería Moura (6 días de stock).",
  ],
  generated: "2026-10-29T09:30:00-03:00",
};

beforeEach(() => {
  unpublishedFeature.mockImplementation(jest.requireActual("./dashboardApi").unpublishedFeature);
});

afterEach(() => jest.clearAllMocks());

describe("resumen con IA (HU 6.3)", () => {
  it("shows the summary points with the date it was generated", async () => {
    getAISummary.mockResolvedValue(summary);
    render(<AISummary />);

    await screen.findByText(summary.puntos[0]);
    const panel = screen.getByRole("region", { name: "Resumen del día" });
    const puntos = within(panel).getAllByRole("listitem");
    expect(puntos).toHaveLength(3);
    expect(puntos[2]).toHaveTextContent("Reponé primero la Batería Moura");
    expect(within(panel).getByText(/Generado el 29 de octubre de 2026/)).toBeInTheDocument();
  });

  it("generates a new one with Actualizar", async () => {
    const user = userEvent.setup();
    getAISummary.mockResolvedValue(summary);
    refreshAISummary.mockResolvedValue({ ...summary, puntos: ["Un resumen nuevo."] });
    render(<AISummary />);

    await user.click(await screen.findByRole("button", { name: "Actualizar" }));

    expect(await screen.findByText("Un resumen nuevo.")).toBeInTheDocument();
    expect(refreshAISummary).toHaveBeenCalledTimes(1);
  });

  it("warns when the AI does not answer", async () => {
    getAISummary.mockRejectedValue(withStatus(503));
    render(<AISummary />);

    expect(await screen.findByText(/El resumen no está disponible en este momento/)).toBeInTheDocument();
  });

  it("says it is in development while the backend does not have it", async () => {
    getAISummary.mockRejectedValue(withStatus(404));
    render(<AISummary />);

    expect(await screen.findByText("En desarrollo")).toBeInTheDocument();
    expect(screen.getByText(/Estamos desarrollando un resumen escrito/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actualizar" })).not.toBeInTheDocument();
  });
});

describe("preguntarle al dashboard (HU 6.4)", () => {
  it("asks a suggested question and shows the answer with the data used", async () => {
    const user = userEvent.setup();
    askDashboard.mockResolvedValue({
      response: "Frenos vendió 320 unidades en julio.",
      info: { columnas: ["Categoría", "Unidades"], rows: [["Frenos", 320], ["Filtros", 210]] },
    });
    render(<AskDashboard disponible />);

    const suggested = screen.getByRole("list", { name: "Preguntas sugeridas" });
    await user.click(within(suggested).getByRole("button", { name: "¿Qué categoría vendió más en julio?" }));

    expect(askDashboard).toHaveBeenCalledWith("¿Qué categoría vendió más en julio?");
    expect(await screen.findByText("Frenos vendió 320 unidades en julio.")).toBeInTheDocument();
    await user.click(screen.getByText("Ver los datos que se usaron"));
    expect(screen.getByRole("table")).toHaveTextContent("Filtros210");
  });

  it("asks what the seller types", async () => {
    const user = userEvent.setup();
    askDashboard.mockResolvedValue({ response: "No tengo esa información.", info: null });
    render(<AskDashboard disponible />);

    expect(screen.getByRole("button", { name: "Preguntar" })).toBeDisabled();
    await user.type(screen.getByLabelText("Tu pregunta"), "¿Qué opinan los clientes?");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));

    expect(await screen.findByText("No tengo esa información.")).toBeInTheDocument();
    expect(screen.queryByText("Ver los datos que se usaron")).not.toBeInTheDocument();
  });

  it("warns when the AI does not answer", async () => {
    const user = userEvent.setup();
    askDashboard.mockRejectedValue(withStatus(503));
    render(<AskDashboard disponible />);

    await user.type(screen.getByLabelText("Tu pregunta"), "¿Cómo vienen las ventas?");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));

    expect(await screen.findByText(/No pudimos responder ahora/)).toBeInTheDocument();
  });

  it("says it is in development and does not let the seller ask while the backend does not have it", () => {
    render(<AskDashboard />);

    expect(screen.getByText("En desarrollo")).toBeInTheDocument();
    expect(screen.getByLabelText("Tu pregunta")).toBeDisabled();
    expect(screen.getByRole("button", { name: "¿Cómo vienen las ventas de Frenos?" })).toBeDisabled();
    expect(askDashboard).not.toHaveBeenCalled();
  });
});
