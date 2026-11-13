// Tests de las secciones del dashboard con IA.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("./dashboardApi");

import AskDashboard from "./AskDashboard";
import AISummary from "./AISummary";
import { refreshAISummary, unpublishedFeature, getAISummary, getAISummaryHistory, askDashboard } from "./dashboardApi";

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

  it("says it is not available when it cannot be generated, and keeps Actualizar to retry", async () => {
    getAISummary.mockRejectedValue(withStatus(503));
    render(<AISummary />);

    expect(await screen.findByText(/Resumen no disponible/)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver resúmenes anteriores" })).toBeInTheDocument();
  });

  it("hides the old summary if Actualizar fails", async () => {
    const user = userEvent.setup();
    getAISummary.mockResolvedValue(summary);
    refreshAISummary.mockRejectedValue(withStatus(429));
    render(<AISummary />);

    await user.click(await screen.findByRole("button", { name: "Actualizar" }));

    expect(await screen.findByText(/Resumen no disponible/)).toBeInTheDocument();
    expect(screen.queryByText(summary.puntos[0])).not.toBeInTheDocument();
  });
});

describe("historial de resúmenes (HU 6.3)", () => {
  const anterior = {
    puntos: ["Ayer las ventas vinieron flojas.", "Frenos cayó.", "Reponé los filtros."],
    generated: "2026-10-28T09:30:00-03:00",
  };

  it("does not ask for the history until it is opened", async () => {
    getAISummary.mockResolvedValue(summary);
    render(<AISummary />);

    await screen.findByText(summary.puntos[0]);
    expect(getAISummaryHistory).not.toHaveBeenCalled();
  });

  it("opens and closes the previous summaries, without repeating the current one", async () => {
    const user = userEvent.setup();
    getAISummary.mockResolvedValue(summary);
    getAISummaryHistory.mockResolvedValue({ days: 7, summaries: [summary, anterior] });
    render(<AISummary />);

    const toggle = await screen.findByRole("button", { name: "Ver resúmenes anteriores" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);

    const list = await screen.findByRole("list", { name: "Resúmenes anteriores" });
    expect(screen.getByText("Últimos 7 días")).toBeInTheDocument();
    expect(within(list).getByText(/28 de octubre de 2026/)).toBeInTheDocument();
    expect(within(list).getByText(anterior.puntos[0])).toBeInTheDocument();
    expect(within(list).queryByText(summary.puntos[0])).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ocultar resúmenes anteriores" }));
    expect(screen.queryByRole("list", { name: "Resúmenes anteriores" })).not.toBeInTheDocument();

    // Al volver a abrirlo no se pide de nuevo.
    await user.click(screen.getByRole("button", { name: "Ver resúmenes anteriores" }));
    expect(await screen.findByRole("list", { name: "Resúmenes anteriores" })).toBeInTheDocument();
    expect(getAISummaryHistory).toHaveBeenCalledTimes(1);
  });

  it("shows the previous summaries even when today's is not available", async () => {
    const user = userEvent.setup();
    getAISummary.mockRejectedValue(withStatus(503));
    getAISummaryHistory.mockResolvedValue({ days: 7, summaries: [anterior] });
    render(<AISummary />);

    await user.click(await screen.findByRole("button", { name: "Ver resúmenes anteriores" }));

    expect(await screen.findByText(anterior.puntos[0])).toBeInTheDocument();
  });

  it("says so when there are no previous summaries, with the days from the API", async () => {
    const user = userEvent.setup();
    getAISummary.mockResolvedValue(summary);
    getAISummaryHistory.mockResolvedValue({ days: 5, summaries: [summary] });
    render(<AISummary />);

    await user.click(await screen.findByRole("button", { name: "Ver resúmenes anteriores" }));

    expect(await screen.findByText("Todavía no hay resúmenes anteriores en los últimos 5 días.")).toBeInTheDocument();
  });

  it("warns if the history cannot be loaded", async () => {
    const user = userEvent.setup();
    getAISummary.mockResolvedValue(summary);
    getAISummaryHistory.mockRejectedValue(withStatus(500));
    render(<AISummary />);

    await user.click(await screen.findByRole("button", { name: "Ver resúmenes anteriores" }));

    expect(await screen.findByText("No pudimos cargar los resúmenes anteriores.")).toBeInTheDocument();
  });
});

describe("preguntarle al dashboard (HU 6.4)", () => {
  it("asks a suggested question and shows the answer with the data used", async () => {
    const user = userEvent.setup();
    askDashboard.mockResolvedValue({
      response: "Frenos vendió 320 unidades en julio.",
      info: { columnas: ["Categoría", "Unidades"], rows: [["Frenos", 320], ["Filtros", 210]] },
    });
    render(<AskDashboard />);

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
    render(<AskDashboard />);

    expect(screen.getByRole("button", { name: "Preguntar" })).toBeDisabled();
    await user.type(screen.getByLabelText("Tu pregunta"), "¿Qué opinan los clientes?");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));

    expect(await screen.findByText("No tengo esa información.")).toBeInTheDocument();
    expect(screen.queryByText("Ver los datos que se usaron")).not.toBeInTheDocument();
  });

  it("warns when the AI does not answer", async () => {
    const user = userEvent.setup();
    askDashboard.mockRejectedValue(withStatus(503));
    render(<AskDashboard />);

    await user.type(screen.getByLabelText("Tu pregunta"), "¿Cómo vienen las ventas?");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));

    expect(await screen.findByText(/No pudimos responder ahora/)).toBeInTheDocument();
  });

  it("shows the suggested questions from the story", () => {
    render(<AskDashboard />);

    const suggested = within(screen.getByRole("list", { name: "Preguntas sugeridas" })).getAllByRole("button");
    expect(suggested.map((button) => button.textContent)).toEqual(
      expect.arrayContaining(["¿Qué repuestos tengo que reponer esta semana?", "¿Cómo vienen las ventas de Frenos?"])
    );
    expect(screen.queryByText("En desarrollo")).not.toBeInTheDocument();
  });

  it("does not ask an empty question and trims what the seller types", async () => {
    const user = userEvent.setup();
    askDashboard.mockResolvedValue({ response: "Vendiste 1.234 unidades.", info: null });
    render(<AskDashboard />);

    await user.type(screen.getByLabelText("Tu pregunta"), "   ");
    expect(screen.getByRole("button", { name: "Preguntar" })).toBeDisabled();

    await user.type(screen.getByLabelText("Tu pregunta"), "¿Cómo vienen las ventas?  {enter}");

    expect(askDashboard).toHaveBeenCalledTimes(1);
    expect(askDashboard).toHaveBeenCalledWith("¿Cómo vienen las ventas?");
    expect(await screen.findByText("Vendiste 1.234 unidades.")).toBeInTheDocument();
    expect(screen.getByText("¿Cómo vienen las ventas?", { selector: "p" })).toBeInTheDocument();
  });

  it("does not let the seller ask again while waiting for the answer", async () => {
    const user = userEvent.setup();
    let resolve;
    askDashboard.mockReturnValue(new Promise((done) => (resolve = done)));
    render(<AskDashboard />);

    await user.click(screen.getByRole("button", { name: "¿Cómo vienen las ventas de Frenos?" }));

    expect(screen.getByLabelText("Pensando…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "¿Qué repuestos tengo que reponer esta semana?" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Preguntar" })).toBeDisabled();
    resolve({ response: "Frenos viene en alza.", info: null });
    expect(await screen.findByText("Frenos viene en alza.")).toBeInTheDocument();
  });

  it("formats the numbers of the data used", async () => {
    const user = userEvent.setup();
    askDashboard.mockResolvedValue({
      response: "Encendido facturó $ 1.250.000.",
      info: { columnas: ["Categoría", "Facturación ($)"], rows: [["Encendido", 1250000]] },
    });
    render(<AskDashboard />);

    await user.click(screen.getByRole("button", { name: "¿Qué categoría vendió más en julio?" }));
    await user.click(await screen.findByText("Ver los datos que se usaron"));

    expect(screen.getByRole("table")).toHaveTextContent("Encendido1.250.000");
  });

  it("shows the message of the hourly limit", async () => {
    const user = userEvent.setup();
    askDashboard.mockRejectedValue(
      Object.assign(new Error("Llegaste al límite de preguntas por hora. Probá de nuevo en un rato."), { status: 429 })
    );
    render(<AskDashboard />);

    await user.click(screen.getByRole("button", { name: "¿Cómo vienen las ventas de Frenos?" }));

    expect(await screen.findByText("Llegaste al límite de preguntas por hora. Probá de nuevo en un rato.")).toBeInTheDocument();
  });
});
