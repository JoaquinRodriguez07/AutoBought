import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";

import Asistente from "./Asistente";
import { consultarAsistente } from "./api";
import { useCart } from "./context/CartContext";
import { useVehicle } from "./context/VehicleContext";

jest.mock("./api", () => ({ consultarAsistente: jest.fn() }));
jest.mock("./context/CartContext", () => ({ useCart: jest.fn() }));
jest.mock("./context/VehicleContext", () => ({
  useVehicle: jest.fn(),
  vehiculoCompleto: (v) => Boolean(v?.brand && v?.model && v?.year),
}));
jest.mock("./Navbar", () => () => <nav aria-label="Navegación" />);
jest.mock("react-hot-toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

const ONIX = { brand: "Chevrolet", model: "Onix", year: "2016" };
const GOL = { brand: "Volkswagen", model: "Gol", year: "2015" };

const pastillas = {
  id: "11", partId: 11, nombre: "Pastillas de freno delanteras Bosch", fabricante: "Bosch",
  codigo: "BRK-0011", precio: 2800, stock: 5, imagen: "/repuestos/pastillas-freno.webp",
};
const discos = {
  id: "12", partId: 12, nombre: "Discos de freno delanteros TRW", fabricante: "TRW",
  codigo: "BRK-0012", precio: 3240, stock: 2, imagen: "/repuestos/discos-freno.webp",
};

const historialUno = [
  { rol: "cliente", texto: "chilla al frenar" },
  { rol: "asistente", texto: "Parece que las pastillas de freno están gastadas." },
];

const respuesta = {
  diagnostico: "Parece que las pastillas de freno están gastadas.",
  urgencia: "alta",
  aviso: "Si los frenos fallan, no manejes.",
  pregunta: "¿El ruido es al frenar suave o fuerte?",
  opciones: ["Suave", "Fuerte"],
  fueraDeTema: false,
  recomendaciones: [{ tipo: "Pastillas de freno", motivo: "El chillido es el indicador de desgaste.", repuestos: [pastillas] }],
  historial: historialUno,
  firma: "firma-1",
};

const conDiscos = {
  ...respuesta,
  recomendaciones: [
    ...respuesta.recomendaciones,
    { tipo: "Discos de freno", motivo: "Con pastillas gastadas, el disco se raya.", repuestos: [discos] },
  ],
};

function RutaActual() {
  const { pathname, search } = useLocation();
  return <p data-testid="ruta">{pathname}{search}</p>;
}

function arbol(props = {}) {
  return (
    <MemoryRouter initialEntries={["/asistente"]}>
      <Routes>
        <Route path="*" element={<><Asistente onHome={jest.fn()} onDetalle={jest.fn()} {...props} /><RutaActual /></>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderAsistente({ vehiculo = ONIX, props = {} } = {}) {
  useVehicle.mockReturnValue({ vehiculoActivo: vehiculo });
  return render(arbol(props));
}

// Una respuesta que llega cuando el test quiere.
function diferida() {
  let resolver;
  const promesa = new Promise((r) => { resolver = r; });
  return { promesa, resolver };
}

const campo = () => screen.getByLabelText("Mensaje para Pit");

async function escribir(user, texto) {
  await user.type(campo(), texto);
  await user.click(screen.getByRole("button", { name: "Enviar" }));
}

let addToCart;

beforeEach(() => {
  addToCart = jest.fn().mockResolvedValue(true);
  useCart.mockReturnValue({ addToCart, deshacerAgregado: jest.fn() });
  consultarAsistente.mockReset();
  toast.success.mockClear();
});

describe("Pit (asistente)", () => {
  it("asks to choose the vehicle before chatting", async () => {
    const onHome = jest.fn();
    renderAsistente({ vehiculo: null, props: { onHome } });

    expect(screen.getByText(/primero elegí cuál es/)).toBeInTheDocument();
    expect(campo()).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Elegir vehículo" }));
    expect(onHome).toHaveBeenCalled();
  });

  it("sends the message with the vehicle and shows the diagnosis, the urgency and the parts", async () => {
    const user = userEvent.setup();
    consultarAsistente.mockResolvedValue(respuesta);
    renderAsistente();

    expect(screen.getByText("Chevrolet Onix 2016")).toBeInTheDocument();
    await escribir(user, "chilla al frenar");

    expect(consultarAsistente).toHaveBeenCalledWith({
      texto: "chilla al frenar", marca: "Chevrolet", modelo: "Onix", anio: "2016", historial: [], firma: null,
    });
    const conversacion = screen.getByRole("log", { name: "Conversación con Pit" });
    expect(within(conversacion).getByText("chilla al frenar")).toBeInTheDocument();
    expect(await screen.findByText(respuesta.diagnostico)).toBeInTheDocument();
    expect(screen.getByText("Urgencia alta")).toBeInTheDocument();
    expect(screen.getByText("Si los frenos fallan, no manejes.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pastillas de freno" })).toBeInTheDocument();
    expect(screen.getByText("El chillido es el indicador de desgaste.")).toBeInTheDocument();
    expect(screen.getByText(/¿El ruido es al frenar suave o fuerte\?/)).toBeInTheDocument();
    expect(campo()).toHaveValue("");
    expect(screen.getByText(/no reemplaza la revisión de un mecánico/)).toBeInTheDocument();
  });

  it("starts with examples that send the message when tapped", async () => {
    const user = userEvent.setup();
    consultarAsistente.mockResolvedValue(respuesta);
    renderAsistente();

    await user.click(screen.getByRole("button", { name: "Chilla cuando freno" }));

    expect(consultarAsistente).toHaveBeenCalledWith(expect.objectContaining({ texto: "Chilla cuando freno" }));
    await screen.findByText(respuesta.diagnostico);
    expect(screen.queryByRole("group", { name: "Por ejemplo" })).not.toBeInTheDocument();
  });

  it("continues the conversation with the signed history, also from a quick reply", async () => {
    const user = userEvent.setup();
    consultarAsistente.mockResolvedValueOnce(respuesta).mockResolvedValueOnce({
      ...respuesta, diagnostico: "Si es al frenar fuerte, revisá también los discos.", pregunta: null, opciones: [],
      historial: [...historialUno, { rol: "cliente", texto: "Fuerte" }], firma: "firma-2",
    });
    renderAsistente();

    await escribir(user, "chilla al frenar");
    const rapidas = await screen.findByRole("group", { name: "Respuestas rápidas" });
    await user.click(within(rapidas).getByRole("button", { name: "Fuerte" }));

    expect(consultarAsistente).toHaveBeenLastCalledWith(expect.objectContaining({
      texto: "Fuerte", historial: historialUno, firma: "firma-1",
    }));
    expect(await screen.findByText("Si es al frenar fuerte, revisá también los discos.")).toBeInTheDocument();
    // La pregunta nueva no tiene respuestas rápidas: las viejas ya no se muestran.
    expect(screen.queryByRole("group", { name: "Respuestas rápidas" })).not.toBeInTheDocument();
  });

  it("shows the steps while thinking", async () => {
    jest.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const { promesa, resolver } = diferida();
      consultarAsistente.mockReturnValue(promesa);
      renderAsistente();

      await escribir(user, "chilla al frenar");

      const pensando = screen.getByRole("status");
      expect(pensando).toHaveTextContent("Pit está pensando.");
      expect(pensando).toHaveTextContent("Analizando el síntoma…");
      expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
      act(() => jest.advanceTimersByTime(1500));
      expect(pensando).toHaveTextContent("Buscando repuestos para tu Chevrolet Onix 2016…");

      await act(async () => resolver(respuesta));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it("adds a recommended part to the cart and opens its detail", async () => {
    const user = userEvent.setup();
    const onDetalle = jest.fn();
    consultarAsistente.mockResolvedValue(respuesta);
    renderAsistente({ props: { onDetalle } });

    await escribir(user, "chilla al frenar");
    await user.click(await screen.findByRole("button", { name: `Agregar ${pastillas.nombre} al carrito` }));

    expect(addToCart).toHaveBeenCalledWith(pastillas, 1);
    await user.click(screen.getByRole("button", { name: `Ver detalle de ${pastillas.nombre}` }));
    expect(onDetalle).toHaveBeenCalledWith(pastillas);
    // Con un solo tipo recomendado no hace falta "Agregar todo".
    expect(screen.queryByRole("button", { name: /Agregar los/ })).not.toBeInTheDocument();
  });

  it("adds one part of each recommended type at once", async () => {
    const user = userEvent.setup();
    consultarAsistente.mockResolvedValue(conDiscos);
    renderAsistente();

    await escribir(user, "chilla al frenar");
    await user.click(await screen.findByRole("button", { name: "Agregar los 2 al carrito · $6.040" }));

    expect(addToCart).toHaveBeenNthCalledWith(1, pastillas, 1);
    expect(addToCart).toHaveBeenNthCalledWith(2, discos, 1);
    expect(toast.success).toHaveBeenCalledWith("Agregamos 2 repuestos al carrito.");
  });

  it("starts a new conversation and ignores an answer that arrives late", async () => {
    const user = userEvent.setup();
    const { promesa, resolver } = diferida();
    consultarAsistente.mockReturnValueOnce(promesa).mockResolvedValueOnce(respuesta);
    renderAsistente();

    await escribir(user, "chilla al frenar");
    await user.click(screen.getByRole("button", { name: "Nueva conversación" }));
    await act(async () => resolver(respuesta));

    expect(screen.queryByText(respuesta.diagnostico)).not.toBeInTheDocument();
    expect(screen.queryByText("chilla al frenar")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Por ejemplo" })).toBeInTheDocument();

    await escribir(user, "otra cosa");
    expect(consultarAsistente).toHaveBeenLastCalledWith(expect.objectContaining({ historial: [], firma: null }));
  });

  it("starts over when the vehicle changes", async () => {
    const user = userEvent.setup();
    consultarAsistente.mockResolvedValue(respuesta);
    const { rerender } = renderAsistente();

    await escribir(user, "chilla al frenar");
    await screen.findByText(respuesta.diagnostico);

    useVehicle.mockReturnValue({ vehiculoActivo: GOL });
    rerender(arbol());

    expect(screen.getByText("Volkswagen Gol 2015")).toBeInTheDocument();
    expect(screen.queryByText(respuesta.diagnostico)).not.toBeInTheDocument();
    await escribir(user, "hace ruido");
    expect(consultarAsistente).toHaveBeenLastCalledWith(expect.objectContaining({ marca: "Volkswagen", historial: [], firma: null }));
  });

  it("offers the normal search when Pit is not available", async () => {
    const user = userEvent.setup();
    const error = new Error("El asistente no está disponible en este momento.");
    error.status = 503;
    consultarAsistente.mockRejectedValue(error);
    renderAsistente();

    await escribir(user, "no arranca");

    expect(await screen.findByRole("alert")).toHaveTextContent("no está disponible");
    await user.click(screen.getByRole("button", { name: 'Buscar "no arranca" en el catálogo' }));
    expect(screen.getByTestId("ruta")).toHaveTextContent("/catalogo?q=no%20arranca");
  });

  it("explains the daily limit without offering a search", async () => {
    const user = userEvent.setup();
    const error = new Error("Llegaste al límite de consultas al asistente por hoy.");
    error.status = 429;
    consultarAsistente.mockRejectedValue(error);
    renderAsistente();

    await escribir(user, "no arranca");

    expect(await screen.findByRole("alert")).toHaveTextContent("límite");
    expect(screen.queryByRole("button", { name: /en el catálogo/ })).not.toBeInTheDocument();
  });

  it("starts a new history if the backend rejects the conversation", async () => {
    const user = userEvent.setup();
    const error = new Error("No pudimos seguir esta conversación. Empezá una nueva.");
    error.status = 400;
    consultarAsistente.mockResolvedValueOnce(respuesta).mockRejectedValueOnce(error).mockResolvedValueOnce(respuesta);
    renderAsistente();

    await escribir(user, "chilla al frenar");
    await screen.findByText(respuesta.diagnostico);
    await escribir(user, "fuerte");
    expect(await screen.findByRole("alert")).toHaveTextContent("Empezá una nueva");

    await escribir(user, "chilla al frenar");
    expect(consultarAsistente).toHaveBeenLastCalledWith(expect.objectContaining({ historial: [], firma: null }));
  });

  it("does not show parts nor urgency for an off-topic question", async () => {
    const user = userEvent.setup();
    consultarAsistente.mockResolvedValue({
      ...respuesta, urgencia: "baja", aviso: null, pregunta: null, opciones: [], fueraDeTema: true, recomendaciones: [],
      diagnostico: "Solo puedo ayudarte con problemas del auto.",
    });
    renderAsistente();

    await escribir(user, "¿quién ganó el partido?");

    expect(await screen.findByText("Solo puedo ayudarte con problemas del auto.")).toBeInTheDocument();
    expect(screen.queryByText("Mantenimiento")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /al carrito/ })).not.toBeInTheDocument();
  });

  it("does not send less than 3 characters", async () => {
    renderAsistente();

    await userEvent.type(campo(), "ab");

    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await waitFor(() => expect(consultarAsistente).not.toHaveBeenCalled());
  });
});
