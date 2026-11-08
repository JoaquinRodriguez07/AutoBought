// Tests del panel de Pit.

import { MemoryRouter, useNavigate } from "react-router-dom";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PitPanel from "./PitPanel";
import { askAssistant } from "./api";
import { useCart } from "./context/CartContext";
import { PitProvider, usePit } from "./context/PitContext";
import { useVehicle } from "./context/VehicleContext";

jest.mock("./api", () => ({ askAssistant: jest.fn() }));
jest.mock("./context/CartContext", () => ({ useCart: jest.fn() }));
jest.mock("./context/VehicleContext", () => ({
  useVehicle: jest.fn(),
  isVehicleComplete: (v) => Boolean(v?.brand && v?.model && v?.year),
}));
jest.mock("react-hot-toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

const pads = {
  id: "11", partId: 11, displayName: "Pastillas de freno delanteras Bosch", fabricante: "Bosch",
  code: "BRK-0011", price: 2800, stock: 5, image: "/repuestos/pastillas-freno.webp",
};

const response = {
  diagnostico: "Parece que las pastillas de freno están gastadas.",
  urgencia: "media", aviso: null, pregunta: null, opciones: [], offTopic: false,
  recomendaciones: [{ tipo: "Pastillas de freno", motivo: "El chillido es el indicador de desgaste.", repuestos: [pads] }],
  historial: [], firma: "firma-1",
};

// Para probar que al cerrar sesión se olvida la charla.
function ButtonForget() {
  const { forget } = usePit();
  return <button type="button" onClick={forget}>Cerrar sesión</button>;
}

// Para probar que el panel se cierra si se cambia de página.
function GoToCart() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate("/carrito")}>Ir al carrito</button>;
}

function renderPanel(props = {}) {
  return render(
    <MemoryRouter>
      <PitProvider>
        <PitPanel {...props} />
        <ButtonForget />
        <GoToCart />
      </PitProvider>
    </MemoryRouter>
  );
}

const openPit = () => screen.getByRole("button", { name: "Abrir Pit, el asistente con IA" });

beforeEach(() => {
  useVehicle.mockReturnValue({ activeVehicle: { brand: "Chevrolet", model: "Onix", year: "2016" } });
  useCart.mockReturnValue({ addToCart: jest.fn().mockResolvedValue(true), undoAdded: jest.fn() });
  askAssistant.mockReset().mockResolvedValue(response);
});

describe("PanelPit", () => {
  it("opens Pit in a side panel with the focus in the chat, and closes it", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(openPit());

    expect(screen.getByRole("dialog", { name: "Pit, tu mecánico con IA" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mensaje para Pit")).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByRole("button", { name: "Cerrar Pit" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(openPit()).toHaveFocus();
  });

  it("calls attention when it appears, but stops once it was opened", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByTestId("latido-pit")).toBeInTheDocument();
    await user.click(openPit());
    await user.click(screen.getByRole("button", { name: "Cerrar Pit" }));

    expect(screen.queryByTestId("latido-pit")).not.toBeInTheDocument();
  });

  it("shows the label for a few seconds, then only on hover", () => {
    jest.useFakeTimers();
    try {
      renderPanel();
      const label = screen.getByText("¿Te puedo ayudar en algo?");
      expect(label).toHaveClass("md:block");

      act(() => jest.advanceTimersByTime(6000));
      expect(label).not.toHaveClass("md:block");
      expect(label).toHaveClass("md:group-hover:block");
    } finally {
      jest.useRealTimers();
    }
  });

  it("closes with Escape and by clicking outside", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(openPit());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(openPit());
    await user.click(screen.getByTestId("fondo-pit"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the conversation after closing and opening again", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(openPit());
    await user.type(screen.getByLabelText("Mensaje para Pit"), "chilla al frenar");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByText(response.diagnostico);
    await user.click(screen.getByRole("button", { name: "Cerrar Pit" }));

    // El botón avisa que hay una charla para seguir.
    await user.click(screen.getByRole("button", { name: "Seguir la conversación con Pit" }));
    expect(screen.getByText("chilla al frenar")).toBeInTheDocument();
    expect(screen.getByText(response.diagnostico)).toBeInTheDocument();
  });

  it("closes when the page changes, keeping the conversation", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(openPit());
    await user.type(screen.getByLabelText("Mensaje para Pit"), "chilla al frenar");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByText(response.diagnostico);

    // Por ejemplo, "Ver carrito" en el aviso de agregado (está por encima del panel).
    await user.click(screen.getByRole("button", { name: "Ir al carrito", hidden: true }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seguir la conversación con Pit" })).toBeInTheDocument();
  });

  it("closes the panel before going to a part", async () => {
    const user = userEvent.setup();
    const onDetail = jest.fn();
    renderPanel({ onDetail });

    await user.click(openPit());
    await user.type(screen.getByLabelText("Mensaje para Pit"), "chilla al frenar");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await user.click(await screen.findByRole("button", { name: `Ver detalle de ${pads.displayName}` }));

    expect(onDetail).toHaveBeenCalledWith(pads);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("forgets the conversation when the session is closed", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(openPit());
    await user.type(screen.getByLabelText("Mensaje para Pit"), "chilla al frenar");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByText(response.diagnostico);
    await user.click(screen.getByRole("button", { name: "Cerrar Pit" }));

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(screen.queryByRole("button", { name: "Seguir la conversación con Pit" })).not.toBeInTheDocument();
    await user.click(openPit());
    expect(screen.queryByText("chilla al frenar")).not.toBeInTheDocument();
  });
});
