import { MemoryRouter } from "react-router-dom";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ResultadoPago from "./ResultadoPago";
import { crearLinkPago, obtenerDetalleCompra, verificarPago } from "./api";
import { irA } from "./redirigir";

jest.mock("./api", () => ({
  crearLinkPago: jest.fn(),
  obtenerDetalleCompra: jest.fn(),
  verificarPago: jest.fn(),
}));

// jsdom no navega a otras páginas: se registra adónde se habría ido.
jest.mock("./redirigir", () => ({ irA: jest.fn() }));

jest.mock("./Navbar", () => () => <nav aria-label="Navegación" />);

const pedido = (estadoPago) => ({ id: 42, estado: "confirmed", estadoPago, total: 3000, items: [] });

function renderResultado(direccion, props = {}) {
  return render(
    <MemoryRouter initialEntries={[direccion]}>
      <ResultadoPago onHistorial={jest.fn()} onCatalogo={jest.fn()} {...props} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ResultadoPago (vuelta de Mercado Pago)", () => {
  test("pago aprobado: lo confirma con el backend y lleva a las compras", async () => {
    const user = userEvent.setup();
    const onHistorial = jest.fn();
    obtenerDetalleCompra.mockResolvedValue(pedido("approved"));

    renderResultado("/pago?pedido=42&collection_status=approved", { onHistorial });

    expect(await screen.findByText(/¡Pago aprobado!/)).toBeInTheDocument();
    expect(obtenerDetalleCompra).toHaveBeenCalledWith("42");
    await user.click(screen.getByRole("button", { name: "Ver mis compras" }));
    expect(onHistorial).toHaveBeenCalled();
  });

  test("con payment_id, primero le pide al backend que confirme el pago", async () => {
    verificarPago.mockResolvedValue("approved");
    obtenerDetalleCompra.mockResolvedValue(pedido("approved"));

    renderResultado("/pago?pedido=42&collection_status=approved&payment_id=999");

    expect(await screen.findByText(/¡Pago aprobado!/)).toBeInTheDocument();
    expect(verificarPago).toHaveBeenCalledWith("42", "999");
    expect(verificarPago.mock.invocationCallOrder[0]).toBeLessThan(obtenerDetalleCompra.mock.invocationCallOrder[0]);
  });

  test("si la verificación falla, consulta el estado igual", async () => {
    verificarPago.mockRejectedValue(new Error("No pudimos conectar con Mercado Pago."));
    obtenerDetalleCompra.mockResolvedValue(pedido("approved"));

    renderResultado("/pago?pedido=42&collection_status=approved&payment_id=999");

    expect(await screen.findByText(/¡Pago aprobado!/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("si volvió sin pagar (payment_id=null), no verifica nada", async () => {
    obtenerDetalleCompra.mockResolvedValue(pedido("pending"));

    renderResultado("/pago?pedido=42&collection_status=null&payment_id=null");

    expect(await screen.findByRole("button", { name: "REINTENTAR PAGO" })).toBeInTheDocument();
    expect(verificarPago).not.toHaveBeenCalled();
  });

  test("si volvió aprobado, no muestra el rechazo del intento anterior", async () => {
    jest.useFakeTimers();
    try {
      // El aviso del pago nuevo todavía no llegó: el backend sigue con el rechazo viejo.
      obtenerDetalleCompra
        .mockResolvedValueOnce(pedido("rejected"))
        .mockResolvedValueOnce(pedido("approved"));

      renderResultado("/pago?pedido=42&collection_status=approved");

      expect(await screen.findByText("Estamos confirmando tu pago...")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "REINTENTAR PAGO" })).not.toBeInTheDocument();
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });

      expect(await screen.findByText(/¡Pago aprobado!/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "REINTENTAR PAGO" })).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test("pago rechazado: deja reintentar con un link nuevo", async () => {
    const user = userEvent.setup();
    obtenerDetalleCompra.mockResolvedValue(pedido("rejected"));
    crearLinkPago.mockResolvedValue("https://mercadopago.test/pagar");

    renderResultado("/pago?pedido=42&collection_status=rejected");

    expect(await screen.findByRole("alert")).toHaveTextContent("El pago no se pudo completar");
    await user.click(screen.getByRole("button", { name: "REINTENTAR PAGO" }));

    expect(crearLinkPago).toHaveBeenCalledWith("42");
    expect(irA).toHaveBeenCalledWith("https://mercadopago.test/pagar");
  });

  test("si volvió sin pagar, no lo hace esperar al aviso de Mercado Pago", async () => {
    obtenerDetalleCompra.mockResolvedValue(pedido("pending"));

    renderResultado("/pago?pedido=42&collection_status=null");

    expect(await screen.findByRole("button", { name: "REINTENTAR PAGO" })).toBeInTheDocument();
    expect(obtenerDetalleCompra).toHaveBeenCalledTimes(1);
  });

  test("mientras el aviso no llega, vuelve a consultar hasta que se aprueba", async () => {
    jest.useFakeTimers();
    try {
      obtenerDetalleCompra
        .mockResolvedValueOnce(pedido("pending"))
        .mockResolvedValueOnce(pedido("approved"));

      renderResultado("/pago?pedido=42&collection_status=approved");

      expect(await screen.findByText("Estamos confirmando tu pago...")).toBeInTheDocument();
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });

      expect(await screen.findByText(/¡Pago aprobado!/)).toBeInTheDocument();
      expect(obtenerDetalleCompra).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test("si sigue pendiente después de varias consultas, avisa que está en proceso", async () => {
    jest.useFakeTimers();
    try {
      obtenerDetalleCompra.mockResolvedValue(pedido("pending"));

      renderResultado("/pago?pedido=42");

      for (let i = 0; i < 10; i++) {
        await act(async () => {
          jest.advanceTimersByTime(3000);
        });
      }

      expect(await screen.findByText(/Tu pago está en proceso/)).toBeInTheDocument();
      expect(obtenerDetalleCompra).toHaveBeenCalledTimes(10);
    } finally {
      jest.useRealTimers();
    }
  });

  test("sin número de pedido o con un pedido ajeno muestra el error", async () => {
    const error = Object.assign(new Error("Pedido no encontrado."), { status: 404 });
    obtenerDetalleCompra.mockRejectedValue(error);

    renderResultado("/pago?pedido=99");
    expect(await screen.findByRole("alert")).toHaveTextContent("Pedido no encontrado.");
  });

  test("sin número de pedido no consulta nada", () => {
    renderResultado("/pago");

    expect(screen.getByRole("alert")).toHaveTextContent("No encontramos ese pedido.");
    expect(obtenerDetalleCompra).not.toHaveBeenCalled();
  });
});
