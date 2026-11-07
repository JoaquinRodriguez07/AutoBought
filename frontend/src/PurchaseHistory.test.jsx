// Tests del historial de compras.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";

import OrderDetail from "./OrderDetail";
import PurchaseHistory from "./PurchaseHistory";
import { confirmReceipt, createPaymentLink, getPurchaseDetail, getPurchaseHistory } from "./api";
import { goTo } from "./redirect";

jest.mock("./api", () => ({
  confirmReceipt: jest.fn(),
  createPaymentLink: jest.fn(),
  getPurchaseDetail: jest.fn(),
  getPurchaseHistory: jest.fn(),
}));

// jsdom no navega a otras páginas: se registra adónde se habría ido.
jest.mock("./redirect", () => ({ goTo: jest.fn() }));

jest.mock("./Navbar", () => () => <nav aria-label="Navegación" />);

// «Mis compras › Anteriores»: solo las compras que ya terminaron.
const compras = [
  { id: 42, fecha: "2026-01-03T00:00:00.000Z", estado: "delivered", total: 3600, items: [] },
  { id: 17, fecha: "2026-01-02T00:00:00.000Z", estado: "cancelled", motivoCancelacion: "store", total: 2400, items: [] },
  { id: 9, fecha: "2026-01-01T00:00:00.000Z", estado: "delivered", total: 1000, items: [] },
];

function renderHistorial() {
  return render(
    <MemoryRouter>
      <PurchaseHistory onPerfil={jest.fn()} />
    </MemoryRouter>
  );
}

const listaDeCompras = () => screen.findByRole("list", { name: "Compras anteriores" });

beforeEach(() => {
  jest.clearAllMocks();
});

describe("HistorialCompras (Mis compras › Anteriores)", () => {
  test("renders the ordered purchase list with date, ID, and total", async () => {
    getPurchaseHistory.mockResolvedValue(compras);

    renderHistorial();

    const pedidos = within(await listaDeCompras()).getAllByRole("listitem");

    expect(pedidos).toHaveLength(3);
    expect(within(pedidos[0]).getByText("#42")).toBeInTheDocument();
    expect(within(pedidos[1]).getByText("#17")).toBeInTheDocument();
    expect(within(pedidos[2]).getByText("#9")).toBeInTheDocument();
    const fechaFormateada = /\d{1,2}\/\d{1,2}\/\d{4}/;
    expect(within(pedidos[0]).getByText(fechaFormateada)).toBeInTheDocument();
    expect(within(pedidos[0]).getByText(/3[.]600|3,600/)).toBeInTheDocument();
    expect(within(pedidos[1]).getByText(/2[.]400|2,400/)).toBeInTheDocument();
    expect(within(pedidos[2]).getByText(/1[.]000|1,000/)).toBeInTheDocument();
    expect(getPurchaseHistory).toHaveBeenCalledTimes(1);
  });

  test("leaves out the orders in progress: they are in the other tab", async () => {
    getPurchaseHistory.mockResolvedValue([
      ...compras,
      { id: 50, fecha: "2026-01-04T00:00:00.000Z", estado: "shipped", estadoPago: "approved", total: 500, items: [] },
      { id: 51, fecha: "2026-01-04T00:00:00.000Z", estado: "confirmed", estadoPago: "pending", total: 500, items: [] },
    ]);

    renderHistorial();

    const lista = await listaDeCompras();
    expect(within(lista).getAllByRole("listitem")).toHaveLength(3);
    expect(within(lista).queryByText("#50")).not.toBeInTheDocument();
    expect(within(lista).queryByText("#51")).not.toBeInTheDocument();
    // Las dos pestañas de Mis compras.
    const pestanas = screen.getByRole("navigation", { name: "Mis compras" });
    expect(within(pestanas).getByRole("button", { name: "Anteriores" })).toHaveAttribute("aria-current", "page");
    expect(within(pestanas).getByRole("button", { name: /En curso/ })).toBeInTheDocument();
  });

  test("shows the status of each purchase and why one was cancelled", async () => {
    getPurchaseHistory.mockResolvedValue(compras);

    renderHistorial();

    const pedidos = within(await listaDeCompras()).getAllByRole("listitem");

    expect(within(pedidos[0]).getByText("Entregado")).toBeInTheDocument();
    expect(within(pedidos[1]).getByText("Cancelado")).toBeInTheDocument();
    expect(within(pedidos[1]).getByText("Lo canceló la tienda")).toBeInTheDocument();
  });

  test("loads and displays the selected purchase details", async () => {
    const user = userEvent.setup();
    getPurchaseHistory.mockResolvedValue(compras);
    getPurchaseDetail.mockResolvedValue({
      ...compras[0],
      direccion: {
        calle: "Av. Italia",
        numero: "1234",
        apartamento: "",
        ciudad: "Montevideo",
        departamento: "Montevideo",
      },
      metodoPago: "Visa •••• 1234",
      items: [{ partId: 1, nombre: "Pastillas de freno", cantidad: 2, precio: 900 }],
    });

    renderHistorial();
    await user.click(await screen.findByRole("button", { name: "Ver detalle del pedido #42" }));

    expect(getPurchaseDetail).toHaveBeenCalledWith(42);
    expect(await screen.findByRole("heading", { name: /Pedido #/ })).toBeInTheDocument();
    expect(screen.getByText("Pastillas de freno")).toBeInTheDocument();
    expect(screen.getByText(/Cantidad: 2 · .*900 c\/u/)).toBeInTheDocument();
    // El subtotal del producto: 2 × 900.
    expect(screen.getByText(/1[.]800|1,800/)).toBeInTheDocument();
    expect(screen.getByText("Av. Italia 1234, Montevideo, Montevideo")).toBeInTheDocument();
    expect(screen.getByText("Visa •••• 1234")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pagar el pedido/ })).not.toBeInTheDocument();
  });

  test("an order cancelled for not being paid in time says so and cannot be paid", async () => {
    const user = userEvent.setup();
    const vencido = { ...compras[0], estado: "cancelled", estadoPago: "pending", metodoPago: "Mercado Pago" };
    getPurchaseHistory.mockResolvedValue([vencido]);
    getPurchaseDetail.mockResolvedValue(vencido);

    renderHistorial();

    const lista = await listaDeCompras();
    expect(within(lista).getByText("Cancelado")).toBeInTheDocument();
    expect(within(lista).getByText("No se completó el pago a tiempo")).toBeInTheDocument();
    expect(within(lista).queryByRole("button", { name: /Pagar el pedido/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver detalle del pedido #42" }));

    expect(await screen.findByText("Este pedido se canceló porque no se completó el pago a tiempo")).toBeInTheDocument();
    expect(screen.getByText("Mercado Pago (no se completó)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pagar el pedido/ })).not.toBeInTheDocument();
  });

  test("shows the products of each order in the list", async () => {
    getPurchaseHistory.mockResolvedValue([
      {
        ...compras[0],
        items: [
          { partId: 1, nombre: "Bujía NGK 1.4 8V", cantidad: 1, precio: 650 },
          { partId: 2, nombre: "Filtro de aire Mann-Filter", cantidad: 1, precio: 940 },
        ],
      },
    ]);

    renderHistorial();

    expect(await screen.findByText("Bujía NGK 1.4 8V y 1 producto más")).toBeInTheDocument();
  });

  test("says there are no finished purchases yet (also when all are in progress)", async () => {
    getPurchaseHistory.mockResolvedValue([{ id: 50, estado: "shipped", estadoPago: "approved", total: 500, items: [] }]);

    renderHistorial();

    expect(await screen.findByText("Todavía no tenés compras terminadas.")).toBeInTheDocument();
    expect(screen.getByText("Cuando te llegue un pedido, lo vas a ver acá.")).toBeInTheDocument();
  });

  test("shows an API error instead of the empty message", async () => {
    getPurchaseHistory.mockRejectedValue(new Error("No pudimos cargar tu historial de compras."));

    renderHistorial();

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar tu historial de compras.");
    expect(screen.queryByText("Todavía no tenés compras terminadas.")).not.toBeInTheDocument();
  });

  test("keeps the purchase list visible when a detail fails to load", async () => {
    getPurchaseHistory.mockResolvedValue(compras);
    getPurchaseDetail.mockRejectedValue(new Error("No pudimos cargar el detalle de la compra."));

    renderHistorial();
    await userEvent.click(await screen.findByRole("button", { name: "Ver detalle del pedido #42" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar el detalle de la compra.");
    expect(screen.getByRole("list", { name: "Compras anteriores" })).toBeInTheDocument();
  });
});

// El detalle de un pedido (el mismo en las dos pestañas de Mis compras):
// pagar, la línea de tiempo y «Ya lo recibí».
describe("DetallePedido", () => {
  const confirmado = { id: 42, fecha: "2026-01-03T00:00:00.000Z", estado: "confirmed", total: 3600, items: [] };
  const enviado = {
    id: 17,
    fecha: "2026-01-02T00:00:00.000Z",
    estado: "shipped",
    total: 2400,
    items: [],
    metodoPago: "Mercado Pago",
    estadoPago: "approved",
    seguimiento: [
      { estado: "confirmed", fecha: "2026-01-02T10:00:00.000Z" },
      { estado: "packing", fecha: "2026-01-02T15:00:00.000Z" },
      { estado: "shipped", fecha: "2026-01-03T09:30:00.000Z" },
    ],
  };

  // Como la página que lo usa: después de «Ya lo recibí» le pasa el pedido entregado.
  function Detalle({ inicial }) {
    const [compra, setCompra] = useState(inicial);
    return <OrderDetail compra={compra} textoVolver="← Volver" onVolver={() => {}} onActualizado={setCompra} />;
  }

  function renderDetalle(compra) {
    const user = userEvent.setup();
    render(<Detalle inicial={compra} />);
    return user;
  }

  test.each([
    ["pending", "pendiente"],
    ["rejected", "rechazado"],
  ])("an order with a %s payment can be paid", async (estadoPago, texto) => {
    createPaymentLink.mockResolvedValue("https://mercadopago.test/pagar");
    const user = renderDetalle({ ...confirmado, metodoPago: "Mercado Pago", estadoPago });

    expect(screen.getByText(`Mercado Pago (${texto})`)).toBeInTheDocument();
    expect(screen.getByText("Pendiente de pago")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pagar el pedido #42 con Mercado Pago" }));

    expect(createPaymentLink).toHaveBeenCalledWith(42);
    expect(goTo).toHaveBeenCalledWith("https://mercadopago.test/pagar");
  });

  test("a paid order has no pay button", () => {
    renderDetalle({ ...confirmado, metodoPago: "Mercado Pago", estadoPago: "approved" });

    expect(screen.getByText("Mercado Pago")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pagar el pedido/ })).not.toBeInTheDocument();
  });

  test("shows the error when Mercado Pago cannot be opened", async () => {
    createPaymentLink.mockRejectedValue(new Error("No pudimos conectar con Mercado Pago. Probá de nuevo en un rato."));
    const user = renderDetalle({ ...confirmado, metodoPago: "Mercado Pago", estadoPago: "pending" });

    await user.click(screen.getByRole("button", { name: "Pagar el pedido #42 con Mercado Pago" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos conectar con Mercado Pago");
    expect(goTo).not.toHaveBeenCalled();
  });

  test("shows the timeline with the date of each stage and the ones still pending", () => {
    renderDetalle(enviado);

    const pasos = within(screen.getByRole("list", { name: "Seguimiento del pedido" })).getAllByRole("listitem");
    expect(pasos.map((paso) => paso.querySelector("p").textContent)).toEqual([
      "Confirmado",
      "Empaquetando",
      "Enviado",
      "Entregado",
    ]);
    const fecha = /\d{2}\/\d{2}\/\d{4}/;
    expect(within(pasos[0]).getByText(fecha)).toBeInTheDocument();
    expect(within(pasos[2]).getByText(fecha)).toBeInTheDocument();
    expect(within(pasos[3]).getByText("Pendiente")).toBeInTheDocument();
    expect(pasos[2]).toHaveAttribute("aria-current", "step");
  });

  test("an unpaid order shows no timeline", () => {
    renderDetalle({ ...confirmado, estadoPago: "pending", seguimiento: [{ estado: "confirmed", fecha: null }] });

    expect(screen.getByRole("button", { name: /Pagar el pedido/ })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Seguimiento del pedido" })).not.toBeInTheDocument();
  });

  test("'Ya lo recibí' marks a shipped order as delivered", async () => {
    const entregado = {
      ...enviado,
      estado: "delivered",
      seguimiento: [...enviado.seguimiento, { estado: "delivered", fecha: "2026-01-05T12:00:00.000Z" }],
    };
    confirmReceipt.mockResolvedValue(entregado);
    const user = renderDetalle(enviado);

    await user.click(screen.getByRole("button", { name: "Ya lo recibí" }));

    expect(confirmReceipt).toHaveBeenCalledWith(17);
    expect(await screen.findByRole("status")).toHaveTextContent("Marcamos el pedido como entregado");
    expect(screen.queryByRole("button", { name: "Ya lo recibí" })).not.toBeInTheDocument();
    const pasos = within(screen.getByRole("list", { name: "Seguimiento del pedido" })).getAllByRole("listitem");
    expect(within(pasos[3]).queryByText("Pendiente")).not.toBeInTheDocument();
  });

  test("shows the error if the arrival can't be confirmed", async () => {
    confirmReceipt.mockRejectedValue(new Error("Solo se puede confirmar la llegada de un pedido enviado."));
    const user = renderDetalle(enviado);

    await user.click(screen.getByRole("button", { name: "Ya lo recibí" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Solo se puede confirmar la llegada");
    expect(screen.getByRole("button", { name: "Ya lo recibí" })).toBeEnabled();
  });

  test.each(["confirmed", "packing", "delivered"])("a %s order has no 'Ya lo recibí' button", (estado) => {
    renderDetalle({ ...enviado, estado });

    expect(screen.getByRole("list", { name: "Seguimiento del pedido" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ya lo recibí" })).not.toBeInTheDocument();
  });

  test("an order cancelled by the store says so", () => {
    renderDetalle({
      ...enviado,
      estado: "cancelled",
      motivoCancelacion: "store",
      seguimiento: [...enviado.seguimiento.slice(0, 2), { estado: "cancelled", fecha: "2026-01-02T18:00:00.000Z" }],
    });

    expect(screen.getByText("La tienda canceló este pedido")).toBeInTheDocument();
    expect(screen.queryByText(/no se completó el pago a tiempo/)).not.toBeInTheDocument();
  });

  test("an expired order says it wasn't paid in time", () => {
    renderDetalle({ ...confirmado, estado: "cancelled", estadoPago: "pending", motivoCancelacion: "expired" });

    expect(screen.getByText(/no se completó el pago a tiempo/)).toBeInTheDocument();
    expect(screen.queryByText("La tienda canceló este pedido")).not.toBeInTheDocument();
  });
});
