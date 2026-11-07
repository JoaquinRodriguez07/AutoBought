// Tests de los pedidos en curso.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import MisPedidos from "./MisPedidos";
import { confirmarRecepcion, crearLinkPago, obtenerDetalleCompra, obtenerHistorialCompras } from "./api";
import { irA } from "./redirigir";
import { estaEnCurso, fraseDelEstado, pasosDeSeguimiento } from "./seguimientoPedido";

jest.mock("./api", () => ({
  confirmarRecepcion: jest.fn(),
  crearLinkPago: jest.fn(),
  obtenerDetalleCompra: jest.fn(),
  obtenerHistorialCompras: jest.fn(),
}));

// jsdom no navega a otras páginas: se registra adónde se habría ido.
jest.mock("./redirigir", () => ({ irA: jest.fn() }));

jest.mock("./Navbar", () => () => <nav aria-label="Navegación" />);

const items = [{ partId: 1, nombre: "Pastillas de freno", codigo: "BRK-1", cantidad: 2, precio: 900 }];

const enCamino = {
  id: 17,
  fecha: "2026-01-02T00:00:00.000Z",
  estado: "shipped",
  estadoPago: "approved",
  metodoPago: "Mercado Pago",
  total: 1800,
  items,
  seguimiento: [
    { estado: "confirmed", fecha: "2026-01-02T10:00:00.000Z" },
    { estado: "packing", fecha: "2026-01-02T15:00:00.000Z" },
    { estado: "shipped", fecha: "2026-01-03T09:30:00.000Z" },
  ],
};

const sinPagar = {
  id: 42,
  fecha: "2026-01-03T00:00:00.000Z",
  estado: "confirmed",
  estadoPago: "pending",
  vencePago: "2026-01-03T00:15:00.000Z",
  metodoPago: "Mercado Pago",
  total: 3600,
  items: [],
};

const entregado = { id: 9, fecha: "2026-01-01T00:00:00.000Z", estado: "delivered", estadoPago: "approved", total: 1000, items: [] };
const vencido = { id: 5, fecha: "2025-12-30T00:00:00.000Z", estado: "cancelled", estadoPago: "pending", total: 700, items: [] };

function Ruta() {
  return <p data-testid="ruta">{useLocation().pathname}</p>;
}

function renderPedidos(direccion = "/pedidos") {
  const props = { onHome: jest.fn(), onCatalogo: jest.fn(), onHistorial: jest.fn() };
  render(
    <MemoryRouter initialEntries={[direccion]}>
      <Routes>
        <Route path="/pedidos" element={<MisPedidos {...props} />} />
        <Route path="/pedidos/:id" element={<MisPedidos {...props} />} />
      </Routes>
      <Ruta />
    </MemoryRouter>
  );
  return props;
}

const enCurso = () => screen.findByRole("list", { name: "Pedidos en curso" });

beforeEach(() => {
  jest.clearAllMocks();
  obtenerHistorialCompras.mockResolvedValue([sinPagar, enCamino, entregado, vencido]);
});

describe("MisPedidos: los pedidos en curso", () => {
  test("shows only the orders that haven't finished, each with what's happening now", async () => {
    renderPedidos();

    const lista = await enCurso();
    expect(within(lista).getByText("Falta pagar")).toBeInTheDocument();
    expect(within(lista).getByText("Está en camino")).toBeInTheDocument();
    expect(within(lista).getByText("Pedido #42")).toBeInTheDocument();
    expect(within(lista).getByText("Pedido #17")).toBeInTheDocument();
    // Los terminados están en el historial, no acá.
    expect(screen.queryByText(/#9/)).not.toBeInTheDocument();
    expect(screen.queryByText(/#5/)).not.toBeInTheDocument();
  });

  test("an order on its way shows its progress bar and an unpaid one its deadline", async () => {
    renderPedidos();

    expect(await screen.findByRole("list", { name: "Progreso del pedido #17: 3 de 4 etapas" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /Progreso del pedido #42/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Pagalo antes de/)).toBeInTheDocument();
  });

  test("the 'Anteriores' tab opens the finished purchases", async () => {
    const user = userEvent.setup();
    renderPedidos();
    await enCurso();

    const pestanas = screen.getByRole("navigation", { name: "Mis compras" });
    expect(within(pestanas).getByRole("button", { name: /En curso/ })).toHaveAttribute("aria-current", "page");
    await user.click(within(pestanas).getByRole("button", { name: "Anteriores" }));

    expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/historial$/);
  });

  test("without orders in progress, says so and leads to the catalog", async () => {
    const user = userEvent.setup();
    obtenerHistorialCompras.mockResolvedValue([entregado, vencido]);
    const props = renderPedidos();

    expect(await screen.findByText("No tenés pedidos en curso.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver repuestos" }));
    expect(props.onCatalogo).toHaveBeenCalled();
  });

  test("shows the error if the orders can't be loaded", async () => {
    obtenerHistorialCompras.mockRejectedValue(new Error("No pudimos cargar tus pedidos."));
    renderPedidos();

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar tus pedidos.");
    expect(screen.queryByText("No tenés pedidos en curso.")).not.toBeInTheDocument();
  });

  test("'Ya lo recibí' delivers the order and takes it off the list", async () => {
    const user = userEvent.setup();
    confirmarRecepcion.mockResolvedValue({ ...enCamino, estado: "delivered" });
    renderPedidos();
    await enCurso();

    await user.click(screen.getByRole("button", { name: "Ya recibí el pedido #17" }));

    expect(confirmarRecepcion).toHaveBeenCalledWith(17);
    expect(await screen.findByRole("status")).toHaveTextContent("Marcamos el pedido #17 como entregado");
    expect(screen.queryByText("Pedido #17")).not.toBeInTheDocument();
    expect(screen.getByText("Pedido #42")).toBeInTheDocument();
  });

  test("shows the error if the arrival can't be confirmed", async () => {
    const user = userEvent.setup();
    confirmarRecepcion.mockRejectedValue(new Error("Solo se puede confirmar la llegada de un pedido enviado."));
    renderPedidos();
    await enCurso();

    await user.click(screen.getByRole("button", { name: "Ya recibí el pedido #17" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Solo se puede confirmar la llegada");
    expect(screen.getByRole("button", { name: "Ya recibí el pedido #17" })).toBeEnabled();
  });

  test("pays an unpaid order from its card", async () => {
    const user = userEvent.setup();
    crearLinkPago.mockResolvedValue("https://mercadopago.test/pagar");
    renderPedidos();
    await enCurso();

    await user.click(screen.getByRole("button", { name: "Pagar el pedido #42 con Mercado Pago" }));

    expect(crearLinkPago).toHaveBeenCalledWith(42);
    expect(irA).toHaveBeenCalledWith("https://mercadopago.test/pagar");
  });

  test("shows the error if Mercado Pago can't be opened", async () => {
    const user = userEvent.setup();
    crearLinkPago.mockRejectedValue(new Error("No pudimos conectar con Mercado Pago."));
    renderPedidos();
    await enCurso();

    await user.click(screen.getByRole("button", { name: "Pagar el pedido #42 con Mercado Pago" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos conectar con Mercado Pago.");
    expect(irA).not.toHaveBeenCalled();
  });

  test("'Ver detalle' opens the order at its own address", async () => {
    const user = userEvent.setup();
    obtenerDetalleCompra.mockResolvedValue(enCamino);
    renderPedidos();
    await enCurso();

    await user.click(screen.getByRole("button", { name: "Ver detalle del pedido #17" }));

    expect(screen.getByTestId("ruta")).toHaveTextContent("/pedidos/17");
    expect(obtenerDetalleCompra).toHaveBeenCalledWith("17");
    expect(await screen.findByRole("heading", { name: "Pedido #17" })).toBeInTheDocument();
  });
});

describe("MisPedidos: el detalle (/pedidos/:id)", () => {
  test("shows the timeline, the products and 'Ya lo recibí'", async () => {
    const user = userEvent.setup();
    obtenerDetalleCompra.mockResolvedValue(enCamino);
    confirmarRecepcion.mockResolvedValue({
      ...enCamino,
      estado: "delivered",
      seguimiento: [...enCamino.seguimiento, { estado: "delivered", fecha: "2026-01-05T12:00:00.000Z" }],
    });
    renderPedidos("/pedidos/17");

    const linea = await screen.findByRole("list", { name: "Seguimiento del pedido" });
    expect(within(linea).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("Pastillas de freno")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ya lo recibí" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Marcamos el pedido como entregado");
    expect(screen.queryByRole("button", { name: "Ya lo recibí" })).not.toBeInTheDocument();
  });

  test("shows the error if the order can't be loaded and lets you go back", async () => {
    const user = userEvent.setup();
    obtenerDetalleCompra.mockRejectedValue(new Error("Pedido no encontrado."));
    renderPedidos("/pedidos/999");

    expect(await screen.findByRole("alert")).toHaveTextContent("Pedido no encontrado.");
    await user.click(screen.getByRole("button", { name: "← Volver a mis compras" }));
    expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/pedidos$/);
  });

  test("goes back to the list", async () => {
    const user = userEvent.setup();
    obtenerDetalleCompra.mockResolvedValue(enCamino);
    renderPedidos("/pedidos/17");

    await user.click(await screen.findByRole("button", { name: "← Volver a mis compras" }));

    expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/pedidos$/);
    expect(await enCurso()).toBeInTheDocument();
  });
});

describe("seguimientoPedido", () => {
  test("estaEnCurso: unpaid, confirmed, packing and shipped orders are in progress", () => {
    expect(estaEnCurso(sinPagar)).toBe(true);
    expect(estaEnCurso({ ...enCamino, estado: "confirmed" })).toBe(true);
    expect(estaEnCurso({ ...enCamino, estado: "packing" })).toBe(true);
    expect(estaEnCurso(enCamino)).toBe(true);
    expect(estaEnCurso(entregado)).toBe(false);
    expect(estaEnCurso(vencido)).toBe(false);
  });

  test("fraseDelEstado says what's happening with the order", () => {
    expect(fraseDelEstado(sinPagar)).toBe("Falta pagar");
    expect(fraseDelEstado({ ...sinPagar, estadoPago: "rejected" })).toBe("El pago fue rechazado");
    expect(fraseDelEstado({ ...enCamino, estado: "confirmed" })).toBe("Lo estamos preparando");
    expect(fraseDelEstado({ ...enCamino, estado: "packing" })).toBe("Lo estamos empaquetando");
    expect(fraseDelEstado(enCamino)).toBe("Está en camino");
  });

  test("pasosDeSeguimiento: a cancelled order shows only the stages it reached and then Cancelado", () => {
    const pasos = pasosDeSeguimiento({
      estado: "cancelled",
      seguimiento: [
        { estado: "confirmed", fecha: "a" },
        { estado: "packing", fecha: "b" },
        { estado: "cancelled", fecha: "c" },
      ],
    });

    expect(pasos).toEqual([
      { estado: "confirmed", hecho: true, fecha: "a" },
      { estado: "packing", hecho: true, fecha: "b" },
      { estado: "cancelled", hecho: true, fecha: "c" },
    ]);
  });

  test("pasosDeSeguimiento: an old order without dates marks the stages up to the current one", () => {
    const pasos = pasosDeSeguimiento({
      estado: "shipped",
      seguimiento: [
        { estado: "confirmed", fecha: "a" },
        { estado: "shipped", fecha: null },
      ],
    });

    expect(pasos.map(({ hecho }) => hecho)).toEqual([true, true, true, false]);
    expect(pasos[1].fecha).toBeNull();
  });

  test("pasosDeSeguimiento: without history it uses the current status", () => {
    expect(pasosDeSeguimiento({ estado: "packing" }).map(({ hecho }) => hecho)).toEqual([true, true, false, false]);
  });
});
