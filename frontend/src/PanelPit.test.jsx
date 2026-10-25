import { MemoryRouter } from "react-router-dom";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PanelPit from "./PanelPit";
import { consultarAsistente } from "./api";
import { useCart } from "./context/CartContext";
import { PitProvider, usePit } from "./context/PitContext";
import { useVehicle } from "./context/VehicleContext";

jest.mock("./api", () => ({ consultarAsistente: jest.fn() }));
jest.mock("./context/CartContext", () => ({ useCart: jest.fn() }));
jest.mock("./context/VehicleContext", () => ({
  useVehicle: jest.fn(),
  vehiculoCompleto: (v) => Boolean(v?.brand && v?.model && v?.year),
}));
jest.mock("react-hot-toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

const pastillas = {
  id: "11", partId: 11, nombre: "Pastillas de freno delanteras Bosch", fabricante: "Bosch",
  codigo: "BRK-0011", precio: 2800, stock: 5, imagen: "/repuestos/pastillas-freno.webp",
};

const respuesta = {
  diagnostico: "Parece que las pastillas de freno están gastadas.",
  urgencia: "media", aviso: null, pregunta: null, opciones: [], fueraDeTema: false,
  recomendaciones: [{ tipo: "Pastillas de freno", motivo: "El chillido es el indicador de desgaste.", repuestos: [pastillas] }],
  historial: [], firma: "firma-1",
};

// Para probar que al cerrar sesión se olvida la charla.
function BotonOlvidar() {
  const { olvidar } = usePit();
  return <button type="button" onClick={olvidar}>Cerrar sesión</button>;
}

function renderPanel(props = {}) {
  return render(
    <MemoryRouter>
      <PitProvider>
        <PanelPit {...props} />
        <BotonOlvidar />
      </PitProvider>
    </MemoryRouter>
  );
}

const abrirPit = () => screen.getByRole("button", { name: "Abrir Pit, el asistente con IA" });

beforeEach(() => {
  useVehicle.mockReturnValue({ vehiculoActivo: { brand: "Chevrolet", model: "Onix", year: "2016" } });
  useCart.mockReturnValue({ addToCart: jest.fn().mockResolvedValue(true), deshacerAgregado: jest.fn() });
  consultarAsistente.mockReset().mockResolvedValue(respuesta);
});

describe("PanelPit", () => {
  it("opens Pit in a side panel with the focus in the chat, and closes it", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(abrirPit());

    expect(screen.getByRole("dialog", { name: "Pit, tu mecánico con IA" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mensaje para Pit")).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByRole("button", { name: "Cerrar Pit" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(abrirPit()).toHaveFocus();
  });

  it("calls attention when it appears, but stops once it was opened", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByTestId("latido-pit")).toBeInTheDocument();
    await user.click(abrirPit());
    await user.click(screen.getByRole("button", { name: "Cerrar Pit" }));

    expect(screen.queryByTestId("latido-pit")).not.toBeInTheDocument();
  });

  it("shows the label for a few seconds, then only on hover", () => {
    jest.useFakeTimers();
    try {
      renderPanel();
      const etiqueta = screen.getByText("¿Te puedo ayudar en algo?");
      expect(etiqueta).toHaveClass("md:block");

      act(() => jest.advanceTimersByTime(6000));
      expect(etiqueta).not.toHaveClass("md:block");
      expect(etiqueta).toHaveClass("md:group-hover:block");
    } finally {
      jest.useRealTimers();
    }
  });

  it("closes with Escape and by clicking outside", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(abrirPit());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(abrirPit());
    await user.click(screen.getByTestId("fondo-pit"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the conversation after closing and opening again", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(abrirPit());
    await user.type(screen.getByLabelText("Mensaje para Pit"), "chilla al frenar");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByText(respuesta.diagnostico);
    await user.click(screen.getByRole("button", { name: "Cerrar Pit" }));

    // El botón avisa que hay una charla para seguir.
    await user.click(screen.getByRole("button", { name: "Seguir la conversación con Pit" }));
    expect(screen.getByText("chilla al frenar")).toBeInTheDocument();
    expect(screen.getByText(respuesta.diagnostico)).toBeInTheDocument();
  });

  it("closes the panel before going to a part", async () => {
    const user = userEvent.setup();
    const onDetalle = jest.fn();
    renderPanel({ onDetalle });

    await user.click(abrirPit());
    await user.type(screen.getByLabelText("Mensaje para Pit"), "chilla al frenar");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await user.click(await screen.findByRole("button", { name: `Ver detalle de ${pastillas.nombre}` }));

    expect(onDetalle).toHaveBeenCalledWith(pastillas);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("forgets the conversation when the session is closed", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(abrirPit());
    await user.type(screen.getByLabelText("Mensaje para Pit"), "chilla al frenar");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByText(respuesta.diagnostico);
    await user.click(screen.getByRole("button", { name: "Cerrar Pit" }));

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(screen.queryByRole("button", { name: "Seguir la conversación con Pit" })).not.toBeInTheDocument();
    await user.click(abrirPit());
    expect(screen.queryByText("chilla al frenar")).not.toBeInTheDocument();
  });
});
