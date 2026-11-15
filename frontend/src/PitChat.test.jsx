// Tests del chat con Pit.

import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";

import PitChat from "./PitChat";
import { askAssistant, getYears, getBrands, getModels } from "./api";
import { useCart } from "./context/CartContext";
import { useVehicle } from "./context/VehicleContext";
import { PitProvider, usePit } from "./context/PitContext";

jest.mock("./api", () => ({
  askAssistant: jest.fn(),
  getBrands: jest.fn(),
  getModels: jest.fn(),
  getYears: jest.fn(),
}));
jest.mock("./context/CartContext", () => ({ useCart: jest.fn() }));
jest.mock("./context/VehicleContext", () => ({
  useVehicle: jest.fn(),
  isVehicleComplete: (v) => Boolean(v?.brand && v?.model && v?.year),
}));
jest.mock("./Navbar", () => () => <nav aria-label="Navegación" />);
jest.mock("react-hot-toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

const ONIX = { brand: "Chevrolet", model: "Onix", year: "2016" };
const GOL = { brand: "Volkswagen", model: "Gol", year: "2015" };

const pads = {
  id: "11", partId: 11, displayName: "Pastillas de freno delanteras Bosch", fabricante: "Bosch",
  code: "BRK-0011", price: 2800, stock: 5, image: "/repuestos/pastillas-freno.webp",
};
const discos = {
  id: "12", partId: 12, displayName: "Discos de freno delanteros TRW", fabricante: "TRW",
  code: "BRK-0012", price: 3240, stock: 2, image: "/repuestos/discos-freno.webp",
};

const historyOne = [
  { rol: "cliente", texto: "chilla al frenar" },
  { rol: "asistente", texto: "Parece que las pastillas de freno están gastadas." },
];

const response = {
  diagnostico: "Parece que las pastillas de freno están gastadas.",
  urgencia: "alta",
  aviso: "Si los frenos fallan, no manejes.",
  pregunta: "¿El ruido es al frenar suave o fuerte?",
  opciones: ["Suave", "Fuerte"],
  offTopic: false,
  recomendaciones: [{ tipo: "Pastillas de freno", motivo: "El chillido es el indicador de desgaste.", repuestos: [pads] }],
  historial: historyOne,
  firma: "firma-1",
};

const withDiscos = {
  ...response,
  recomendaciones: [
    ...response.recomendaciones,
    { tipo: "Discos de freno", motivo: "Con pastillas gastadas, el disco se raya.", repuestos: [discos] },
  ],
};

function CurrentRoute() {
  const { pathname, search } = useLocation();
  return <p data-testid="route">{pathname}{search}</p>;
}

// El chat conectado a la conversación de PitContext, como lo usa PanelPit.
function ConnectedChat({ onDetail = jest.fn(), initialText }) {
  const navigate = useNavigate();
  const { vehicle, conversation } = usePit();
  const { activateVehicle } = useVehicle();
  return (
    <PitChat
      vehicle={vehicle}
      conversation={conversation}
      onDetail={onDetail}
      onActivateVehicle={activateVehicle}
      initialText={initialText}
      onSearchInCatalogo={(queryState) => navigate(`/catalogo?q=${encodeURIComponent(queryState)}`)}
    />
  );
}

function arbol(props = {}) {
  return (
    <MemoryRouter initialEntries={["/catalogo"]}>
      <PitProvider>
        <Routes>
          <Route path="*" element={<><ConnectedChat {...props} /><CurrentRoute /></>} />
        </Routes>
      </PitProvider>
    </MemoryRouter>
  );
}

let activateVehicle;

function renderAssistant({ vehicle = ONIX, props = {} } = {}) {
  useVehicle.mockReturnValue({ activeVehicle: vehicle, activateVehicle });
  return render(arbol(props));
}

// Una respuesta que llega cuando el test quiere.
function deferred() {
  let resolver;
  const promesa = new Promise((r) => { resolver = r; });
  return { promesa, resolver };
}

const field = () => screen.getByLabelText("Mensaje para Pit");

async function escribir(user, texto) {
  await user.type(field(), texto);
  await user.click(screen.getByRole("button", { name: "Enviar" }));
}

let addToCart;

beforeEach(() => {
  activateVehicle = jest.fn();
  getBrands.mockResolvedValue([{ brand: "Chevrolet" }, { brand: "Volkswagen" }]);
  getModels.mockImplementation(async (marca) => (marca === "Volkswagen" ? ["Gol"] : ["Onix", "Prisma"]));
  getYears.mockResolvedValue([2015, 2016]);
  addToCart = jest.fn().mockResolvedValue(true);
  useCart.mockReturnValue({ addToCart, undoAdded: jest.fn() });
  askAssistant.mockReset();
  toast.success.mockClear();
});

describe("ChatPit", () => {
  it("lets the client choose the vehicle inside the chat before talking", async () => {
    const user = userEvent.setup();
    renderAssistant({ vehicle: null });

    expect(screen.getByText(/primero decime qué auto tenés/)).toBeInTheDocument();
    expect(field()).toBeDisabled();
    const ready = screen.getByRole("button", { name: "Listo" });
    expect(ready).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/^Marca/), await screen.findByRole("option", { name: "Chevrolet" }));
    await user.selectOptions(screen.getByLabelText(/^Modelo/), await screen.findByRole("option", { name: "Onix" }));
    await user.selectOptions(screen.getByLabelText(/^Año/), await screen.findByRole("option", { name: "2016" }));
    await user.click(ready);

    expect(getYears).toHaveBeenCalledWith("Chevrolet", "Onix");
    expect(activateVehicle).toHaveBeenCalledWith({ brand: "Chevrolet", model: "Onix", year: "2016" });
  });

  it("changes the vehicle from the chat, warning that the conversation starts over", async () => {
    const user = userEvent.setup();
    askAssistant.mockResolvedValue(response);
    renderAssistant();

    await escribir(user, "chilla al frenar");
    await screen.findByText(response.diagnostico);
    await user.click(screen.getByRole("button", { name: "Cambiar" }));

    expect(screen.getByLabelText(/^Marca/)).toHaveValue("Chevrolet");
    expect(screen.getByText("Si cambiás de auto, la charla empieza de nuevo.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("form", { name: "Elegir vehículo" })).not.toBeInTheDocument();
    expect(activateVehicle).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cambiar" }));
    await user.selectOptions(screen.getByLabelText(/^Marca/), await screen.findByRole("option", { name: "Volkswagen" }));
    await user.selectOptions(screen.getByLabelText(/^Modelo/), await screen.findByRole("option", { name: "Gol" }));
    await user.selectOptions(screen.getByLabelText(/^Año/), await screen.findByRole("option", { name: "2015" }));
    await user.click(screen.getByRole("button", { name: "Listo" }));

    expect(activateVehicle).toHaveBeenCalledWith({ brand: "Volkswagen", model: "Gol", year: "2015" });
  });

  it("starts with the text it was opened with, ready to send", () => {
    renderAssistant({ props: { initialText: "ruido al frenar" } });

    expect(field()).toHaveValue("ruido al frenar");
    expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
  });

  it("sends the message with the vehicle and shows the diagnosis, the urgency and the parts", async () => {
    const user = userEvent.setup();
    askAssistant.mockResolvedValue(response);
    renderAssistant();

    expect(screen.getByText("Chevrolet Onix 2016")).toBeInTheDocument();
    await escribir(user, "chilla al frenar");

    expect(askAssistant).toHaveBeenCalledWith({
      texto: "chilla al frenar", marca: "Chevrolet", modelo: "Onix", anio: "2016", historial: [], firma: null,
    });
    const conversation = screen.getByRole("log", { name: "Conversación con Pit" });
    expect(within(conversation).getByText("chilla al frenar")).toBeInTheDocument();
    expect(await screen.findByText(response.diagnostico)).toBeInTheDocument();
    expect(screen.getByText("Urgencia alta")).toBeInTheDocument();
    expect(screen.getByText("Si los frenos fallan, no manejes.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pastillas de freno" })).toBeInTheDocument();
    expect(screen.getByText("El chillido es el indicador de desgaste.")).toBeInTheDocument();
    expect(screen.getByText(/¿El ruido es al frenar suave o fuerte\?/)).toBeInTheDocument();
    expect(field()).toHaveValue("");
    expect(screen.getByText(/no reemplaza la revisión de un mecánico/)).toBeInTheDocument();
  });

  it("starts with examples that send the message when tapped", async () => {
    const user = userEvent.setup();
    askAssistant.mockResolvedValue(response);
    renderAssistant();

    await user.click(screen.getByRole("button", { name: "Chilla cuando freno" }));

    expect(askAssistant).toHaveBeenCalledWith(expect.objectContaining({ texto: "Chilla cuando freno" }));
    await screen.findByText(response.diagnostico);
    expect(screen.queryByRole("group", { name: "Por ejemplo" })).not.toBeInTheDocument();
  });

  it("continues the conversation with the signed history, also from a quick reply", async () => {
    const user = userEvent.setup();
    askAssistant.mockResolvedValueOnce(response).mockResolvedValueOnce({
      ...response, diagnostico: "Si es al frenar fuerte, revisá también los discos.", pregunta: null, opciones: [],
      historial: [...historyOne, { rol: "cliente", texto: "Fuerte" }], firma: "firma-2",
    });
    renderAssistant();

    await escribir(user, "chilla al frenar");
    const quick = await screen.findByRole("group", { name: "Respuestas rápidas" });
    await user.click(within(quick).getByRole("button", { name: "Fuerte" }));

    expect(askAssistant).toHaveBeenLastCalledWith(expect.objectContaining({
      texto: "Fuerte", historial: historyOne, firma: "firma-1",
    }));
    expect(await screen.findByText("Si es al frenar fuerte, revisá también los discos.")).toBeInTheDocument();
    // La pregunta nueva no tiene respuestas rápidas: las viejas ya no se muestran.
    expect(screen.queryByRole("group", { name: "Respuestas rápidas" })).not.toBeInTheDocument();
  });

  it("shows the steps while thinking", async () => {
    jest.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const { promesa, resolver } = deferred();
      askAssistant.mockReturnValue(promesa);
      renderAssistant();

      await escribir(user, "chilla al frenar");

      const thinking = screen.getByRole("status");
      expect(thinking).toHaveTextContent("Pit está pensando.");
      expect(thinking).toHaveTextContent("Analizando el síntoma…");
      expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
      act(() => jest.advanceTimersByTime(1500));
      expect(thinking).toHaveTextContent("Buscando repuestos para tu Chevrolet Onix 2016…");

      await act(async () => resolver(response));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it("adds a recommended part to the cart and opens its detail", async () => {
    const user = userEvent.setup();
    const onDetail = jest.fn();
    askAssistant.mockResolvedValue(response);
    renderAssistant({ props: { onDetail } });

    await escribir(user, "chilla al frenar");
    await user.click(await screen.findByRole("button", { name: `Agregar ${pads.displayName} al carrito` }));

    expect(addToCart).toHaveBeenCalledWith(pads, 1);
    await user.click(screen.getByRole("button", { name: `Ver detalle de ${pads.displayName}` }));
    expect(onDetail).toHaveBeenCalledWith(pads);
    // Con un solo tipo recomendado no hace falta "Agregar todo".
    expect(screen.queryByRole("button", { name: /Agregar los/ })).not.toBeInTheDocument();
  });

  it("adds one part of each recommended type at once", async () => {
    const user = userEvent.setup();
    askAssistant.mockResolvedValue(withDiscos);
    renderAssistant();

    await escribir(user, "chilla al frenar");
    await user.click(await screen.findByRole("button", { name: "Agregar los 2 al carrito · $6.040" }));

    // Sin un aviso por cada uno: al final, uno solo con el total.
    expect(addToCart).toHaveBeenNthCalledWith(1, pads, 1, { aviso: false });
    expect(addToCart).toHaveBeenNthCalledWith(2, discos, 1, { aviso: false });
    expect(toast.success).toHaveBeenCalledWith("Agregamos 2 repuestos al carrito.");
  });

  it("starts a new conversation and ignores an answer that arrives late", async () => {
    const user = userEvent.setup();
    const { promesa, resolver } = deferred();
    askAssistant.mockReturnValueOnce(promesa).mockResolvedValueOnce(response);
    renderAssistant();

    await escribir(user, "chilla al frenar");
    await user.click(screen.getByRole("button", { name: "Nueva conversación" }));
    await act(async () => resolver(response));

    expect(screen.queryByText(response.diagnostico)).not.toBeInTheDocument();
    expect(screen.queryByText("chilla al frenar")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Por ejemplo" })).toBeInTheDocument();

    await escribir(user, "otra cosa");
    expect(askAssistant).toHaveBeenLastCalledWith(expect.objectContaining({ historial: [], firma: null }));
  });

  it("starts over when the vehicle changes", async () => {
    const user = userEvent.setup();
    askAssistant.mockResolvedValue(response);
    const { rerender } = renderAssistant();

    await escribir(user, "chilla al frenar");
    await screen.findByText(response.diagnostico);

    useVehicle.mockReturnValue({ activeVehicle: GOL, activateVehicle });
    rerender(arbol());

    expect(screen.getByText("Volkswagen Gol 2015")).toBeInTheDocument();
    expect(screen.queryByText(response.diagnostico)).not.toBeInTheDocument();
    await escribir(user, "hace ruido");
    expect(askAssistant).toHaveBeenLastCalledWith(expect.objectContaining({ marca: "Volkswagen", historial: [], firma: null }));
  });

  it("offers the normal search when Pit is not available", async () => {
    const user = userEvent.setup();
    const error = new Error("El asistente no está disponible en este momento.");
    error.status = 503;
    askAssistant.mockRejectedValue(error);
    renderAssistant();

    await escribir(user, "no arranca");

    expect(await screen.findByRole("alert")).toHaveTextContent("no está disponible");
    await user.click(screen.getByRole("button", { name: 'Buscar "no arranca" en el catálogo' }));
    expect(screen.getByTestId("route")).toHaveTextContent("/catalogo?q=no%20arranca");
  });

  it("explains the daily limit without offering a search", async () => {
    const user = userEvent.setup();
    const error = new Error("Llegaste al límite de consultas al asistente por hoy.");
    error.status = 429;
    askAssistant.mockRejectedValue(error);
    renderAssistant();

    await escribir(user, "no arranca");

    expect(await screen.findByRole("alert")).toHaveTextContent("límite");
    expect(screen.queryByRole("button", { name: /en el catálogo/ })).not.toBeInTheDocument();
  });

  it("starts a new history if the backend rejects the conversation", async () => {
    const user = userEvent.setup();
    const error = new Error("No pudimos seguir esta conversación. Empezá una nueva.");
    error.status = 400;
    askAssistant.mockResolvedValueOnce(response).mockRejectedValueOnce(error).mockResolvedValueOnce(response);
    renderAssistant();

    await escribir(user, "chilla al frenar");
    await screen.findByText(response.diagnostico);
    await escribir(user, "fuerte");
    expect(await screen.findByRole("alert")).toHaveTextContent("Empezá una nueva");

    await escribir(user, "chilla al frenar");
    expect(askAssistant).toHaveBeenLastCalledWith(expect.objectContaining({ historial: [], firma: null }));
  });

  it("does not show parts nor urgency for an off-topic question", async () => {
    const user = userEvent.setup();
    askAssistant.mockResolvedValue({
      ...response, urgencia: "baja", aviso: null, pregunta: null, opciones: [], offTopic: true, recomendaciones: [],
      diagnostico: "Solo puedo ayudarte con problemas del auto.",
    });
    renderAssistant();

    await escribir(user, "¿quién ganó el partido?");

    expect(await screen.findByText("Solo puedo ayudarte con problemas del auto.")).toBeInTheDocument();
    expect(screen.queryByText("Mantenimiento")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /al carrito/ })).not.toBeInTheDocument();
  });

  it("does not send less than 3 characters", async () => {
    renderAssistant();

    await userEvent.type(field(), "ab");

    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await waitFor(() => expect(askAssistant).not.toHaveBeenCalled());
  });
});
