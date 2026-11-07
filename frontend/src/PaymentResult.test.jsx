// Tests de la pantalla de vuelta de Mercado Pago.

import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PaymentResult from "./PaymentResult";
import { createPaymentLink, getPurchaseDetail, verifyPayment } from "./api";
import { goTo } from "./redirect";

jest.mock("./api", () => ({
  createPaymentLink: jest.fn(),
  getPurchaseDetail: jest.fn(),
  verifyPayment: jest.fn(),
}));

// jsdom no navega a otras páginas: se registra adónde se habría ido.
jest.mock("./redirect", () => ({ goTo: jest.fn() }));

jest.mock("./Navbar", () => () => <nav aria-label="Navegación" />);

const pedido = (paymentStatus) => ({ id: 42, estado: "confirmed", paymentStatus, total: 3000, items: [] });

function RouteEntry() {
  return <p data-testid="route">{useLocation().pathname}</p>;
}

function renderResult(shippingAddress, props = {}) {
  return render(
    <MemoryRouter initialEntries={[shippingAddress]}>
      <Routes>
        <Route path="/pago" element={<PaymentResult onHistory={jest.fn()} onCatalogo={jest.fn()} {...props} />} />
        <Route path="*" element={<RouteEntry />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ResultadoPago (vuelta de Mercado Pago)", () => {
  test("pago aprobado: lo confirma con el backend y lleva al seguimiento del pedido", async () => {
    const user = userEvent.setup();
    getPurchaseDetail.mockResolvedValue(pedido("approved"));

    renderResult("/pago?pedido=42&collection_status=approved");

    expect(await screen.findByText(/¡Pago aprobado!/)).toBeInTheDocument();
    expect(getPurchaseDetail).toHaveBeenCalledWith("42");
    await user.click(screen.getByRole("button", { name: "Seguir mi pedido" }));
    expect(screen.getByTestId("route")).toHaveTextContent("/pedidos/42");
  });

  test("con payment_id, primero le pide al backend que confirme el pago", async () => {
    verifyPayment.mockResolvedValue("approved");
    getPurchaseDetail.mockResolvedValue(pedido("approved"));

    renderResult("/pago?pedido=42&collection_status=approved&payment_id=999");

    expect(await screen.findByText(/¡Pago aprobado!/)).toBeInTheDocument();
    expect(verifyPayment).toHaveBeenCalledWith("42", "999");
    expect(verifyPayment.mock.invocationCallOrder[0]).toBeLessThan(getPurchaseDetail.mock.invocationCallOrder[0]);
  });

  test("si la verificación falla, consulta el estado igual", async () => {
    verifyPayment.mockRejectedValue(new Error("No pudimos conectar con Mercado Pago."));
    getPurchaseDetail.mockResolvedValue(pedido("approved"));

    renderResult("/pago?pedido=42&collection_status=approved&payment_id=999");

    expect(await screen.findByText(/¡Pago aprobado!/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("si volvió sin pagar (payment_id=null), no verifica nada", async () => {
    getPurchaseDetail.mockResolvedValue(pedido("pending"));

    renderResult("/pago?pedido=42&collection_status=null&payment_id=null");

    expect(await screen.findByRole("button", { name: "Reintentar pago" })).toBeInTheDocument();
    expect(verifyPayment).not.toHaveBeenCalled();
  });

  test("si volvió aprobado, no muestra el rechazo del intento anterior", async () => {
    jest.useFakeTimers();
    try {
      // El aviso del pago nuevo todavía no llegó: el backend sigue con el rechazo viejo.
      getPurchaseDetail
        .mockResolvedValueOnce(pedido("rejected"))
        .mockResolvedValueOnce(pedido("approved"));

      renderResult("/pago?pedido=42&collection_status=approved");

      expect(await screen.findByText("Estamos confirmando tu pago...")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reintentar pago" })).not.toBeInTheDocument();
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });

      expect(await screen.findByText(/¡Pago aprobado!/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reintentar pago" })).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test("pago rechazado: deja reintentar con un link nuevo", async () => {
    const user = userEvent.setup();
    getPurchaseDetail.mockResolvedValue(pedido("rejected"));
    createPaymentLink.mockResolvedValue("https://mercadopago.test/pagar");

    renderResult("/pago?pedido=42&collection_status=rejected");

    expect(await screen.findByRole("alert")).toHaveTextContent("El pago no se pudo completar");
    await user.click(screen.getByRole("button", { name: "Reintentar pago" }));

    expect(createPaymentLink).toHaveBeenCalledWith("42");
    expect(goTo).toHaveBeenCalledWith("https://mercadopago.test/pagar");
  });

  test("si volvió sin pagar, no lo hace esperar al aviso de Mercado Pago", async () => {
    getPurchaseDetail.mockResolvedValue(pedido("pending"));

    renderResult("/pago?pedido=42&collection_status=null");

    expect(await screen.findByRole("button", { name: "Reintentar pago" })).toBeInTheDocument();
    expect(getPurchaseDetail).toHaveBeenCalledTimes(1);
  });

  test("mientras el aviso no llega, vuelve a consultar hasta que se aprueba", async () => {
    jest.useFakeTimers();
    try {
      getPurchaseDetail
        .mockResolvedValueOnce(pedido("pending"))
        .mockResolvedValueOnce(pedido("approved"));

      renderResult("/pago?pedido=42&collection_status=approved");

      expect(await screen.findByText("Estamos confirmando tu pago...")).toBeInTheDocument();
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });

      expect(await screen.findByText(/¡Pago aprobado!/)).toBeInTheDocument();
      expect(getPurchaseDetail).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test("si sigue pendiente después de varias consultas, avisa que está en proceso", async () => {
    jest.useFakeTimers();
    try {
      getPurchaseDetail.mockResolvedValue(pedido("pending"));

      renderResult("/pago?pedido=42");

      for (let i = 0; i < 10; i++) {
        await act(async () => {
          jest.advanceTimersByTime(3000);
        });
      }

      expect(await screen.findByText(/Tu pago está en proceso/)).toBeInTheDocument();
      expect(getPurchaseDetail).toHaveBeenCalledTimes(10);
    } finally {
      jest.useRealTimers();
    }
  });

  test("al salir de la pantalla deja de consultar el pago", async () => {
    jest.useFakeTimers();
    try {
      getPurchaseDetail.mockResolvedValue(pedido("pending"));

      const { unmount } = renderResult("/pago?pedido=42");
      expect(await screen.findByText("Estamos confirmando tu pago...")).toBeInTheDocument();
      expect(getPurchaseDetail).toHaveBeenCalledTimes(1);

      unmount();
      await act(async () => {
        jest.advanceTimersByTime(30000);
      });

      expect(getPurchaseDetail).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("si sale mientras espera la respuesta, no vuelve a consultar", async () => {
    jest.useFakeTimers();
    try {
      let responder;
      getPurchaseDetail.mockReturnValueOnce(new Promise((resolve) => { responder = resolve; }));

      const { unmount } = renderResult("/pago?pedido=42");
      await act(async () => {});
      expect(getPurchaseDetail).toHaveBeenCalledTimes(1);

      unmount();
      // Primero llega la respuesta y después pasa el tiempo de espera.
      await act(async () => {
        responder(pedido("pending"));
      });
      await act(async () => {
        jest.advanceTimersByTime(30000);
      });

      expect(getPurchaseDetail).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("sin número de pedido o con un pedido ajeno muestra el error", async () => {
    const error = Object.assign(new Error("Pedido no encontrado."), { status: 404 });
    getPurchaseDetail.mockRejectedValue(error);

    renderResult("/pago?pedido=99");
    expect(await screen.findByRole("alert")).toHaveTextContent("Pedido no encontrado.");
  });

  test("sin número de pedido no consulta nada", () => {
    renderResult("/pago");

    expect(screen.getByRole("alert")).toHaveTextContent("No encontramos ese pedido.");
    expect(getPurchaseDetail).not.toHaveBeenCalled();
  });
});
