import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HistorialCompras from "./HistorialCompras";
import { crearLinkPago, obtenerDetalleCompra, obtenerHistorialCompras } from "./api";
import { irA } from "./redirigir";

jest.mock("./api", () => ({
  crearLinkPago: jest.fn(),
  obtenerDetalleCompra: jest.fn(),
  obtenerHistorialCompras: jest.fn(),
}));

// jsdom no navega a otras páginas: se registra adónde se habría ido.
jest.mock("./redirigir", () => ({ irA: jest.fn() }));

jest.mock("./Navbar", () => () => <nav aria-label="Navegación" />);

const compras = [
  { id: 42, fecha: "2026-01-03T00:00:00.000Z", estado: "confirmed", total: 3600, items: [] },
  { id: 17, fecha: "2026-01-02T00:00:00.000Z", estado: "shipped", total: 2400, items: [] },
  { id: 9, fecha: "2026-01-01T00:00:00.000Z", estado: "delivered", total: 1000, items: [] },
];

function renderHistorial() {
  return render(<HistorialCompras onPerfil={jest.fn()} />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("HistorialCompras", () => {
  test("renders the ordered purchase list with date, ID, and total", async () => {
    obtenerHistorialCompras.mockResolvedValue(compras);

    renderHistorial();

    const lista = await screen.findByRole("list", {
      name: "Compras realizadas",
    });
    const pedidos = within(lista).getAllByRole("listitem");

    expect(pedidos).toHaveLength(3);
    expect(within(pedidos[0]).getByText("#42")).toBeInTheDocument();
    expect(within(pedidos[1]).getByText("#17")).toBeInTheDocument();
    expect(within(pedidos[2]).getByText("#9")).toBeInTheDocument();
    const fechaFormateada = /\d{1,2}\/\d{1,2}\/\d{4}/;
    expect(within(pedidos[0]).getByText(fechaFormateada)).toBeInTheDocument();
    expect(within(pedidos[1]).getByText(fechaFormateada)).toBeInTheDocument();
    expect(within(pedidos[2]).getByText(fechaFormateada)).toBeInTheDocument();
    expect(within(pedidos[0]).getByText(/3[.]600|3,600/)).toBeInTheDocument();
    expect(within(pedidos[1]).getByText(/2[.]400|2,400/)).toBeInTheDocument();
    expect(within(pedidos[2]).getByText(/1[.]000|1,000/)).toBeInTheDocument();
    expect(obtenerHistorialCompras).toHaveBeenCalledTimes(1);
  });

  test("shows the status of each purchase", async () => {
    obtenerHistorialCompras.mockResolvedValue(compras);

    renderHistorial();

    const lista = await screen.findByRole("list", {
      name: "Compras realizadas",
    });
    const pedidos = within(lista).getAllByRole("listitem");

    expect(within(pedidos[0]).getByText("Confirmado")).toBeInTheDocument();
    expect(within(pedidos[1]).getByText("Enviado")).toBeInTheDocument();
    expect(within(pedidos[2]).getByText("Entregado")).toBeInTheDocument();
  });

  test("loads and displays the selected purchase details", async () => {
    const user = userEvent.setup();
    obtenerHistorialCompras.mockResolvedValue(compras);
    obtenerDetalleCompra.mockResolvedValue({
      ...compras[0],
      direccion: {
        calle: "Av. Italia",
        numero: "1234",
        apartamento: "",
        ciudad: "Montevideo",
        departamento: "Montevideo",
      },
      metodoPago: "Visa •••• 1234",
      items: [
        {
          partId: 1,
          nombre: "Pastillas de freno",
          cantidad: 2,
          precio: 900,
        },
      ],
    });

    renderHistorial();
    await user.click(
      await screen.findByRole("button", {
        name: "Ver detalle del pedido #42",
      })
    );

    expect(obtenerDetalleCompra).toHaveBeenCalledWith(42);
    expect(
      await screen.findByRole("heading", { name: /Pedido #/ })
    ).toBeInTheDocument();
    expect(screen.getByText("Pastillas de freno")).toBeInTheDocument();
    expect(screen.getByText(/Cantidad: 2 · .*900 c\/u/)).toBeInTheDocument();
    // El subtotal del producto: 2 × 900.
    expect(screen.getByText(/1[.]800|1,800/)).toBeInTheDocument();
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
    expect(
      screen.getByText("Av. Italia 1234, Montevideo, Montevideo")
    ).toBeInTheDocument();
    expect(screen.getByText("Visa •••• 1234")).toBeInTheDocument();
    // Un pedido de antes de Mercado Pago ya está cobrado.
    expect(screen.queryByRole("button", { name: /Pagar el pedido/ })).not.toBeInTheDocument();
  });

  test.each([
    ["pending", "pendiente"],
    ["rejected", "rechazado"],
  ])("an order with a %s payment can be paid from its detail", async (estadoPago, texto) => {
    const user = userEvent.setup();
    obtenerHistorialCompras.mockResolvedValue(compras);
    obtenerDetalleCompra.mockResolvedValue({ ...compras[0], metodoPago: "Mercado Pago", estadoPago });
    crearLinkPago.mockResolvedValue("https://mercadopago.test/pagar");

    renderHistorial();
    await user.click(await screen.findByRole("button", { name: "Ver detalle del pedido #42" }));

    expect(await screen.findByText(`Mercado Pago (${texto})`)).toBeInTheDocument();
    expect(screen.getByText("Pendiente de pago")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pagar el pedido #42 con Mercado Pago" }));

    expect(crearLinkPago).toHaveBeenCalledWith(42);
    expect(irA).toHaveBeenCalledWith("https://mercadopago.test/pagar");
  });

  test("a paid order has no pay button", async () => {
    const user = userEvent.setup();
    obtenerHistorialCompras.mockResolvedValue(compras);
    obtenerDetalleCompra.mockResolvedValue({ ...compras[0], metodoPago: "Mercado Pago", estadoPago: "approved" });

    renderHistorial();
    await user.click(await screen.findByRole("button", { name: "Ver detalle del pedido #42" }));

    expect(await screen.findByText("Mercado Pago")).toBeInTheDocument();
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pagar el pedido/ })).not.toBeInTheDocument();
  });

  test("shows the error when Mercado Pago cannot be opened", async () => {
    const user = userEvent.setup();
    obtenerHistorialCompras.mockResolvedValue(compras);
    obtenerDetalleCompra.mockResolvedValue({ ...compras[0], metodoPago: "Mercado Pago", estadoPago: "pending" });
    crearLinkPago.mockRejectedValue(new Error("No pudimos conectar con Mercado Pago. Probá de nuevo en un rato."));

    renderHistorial();
    await user.click(await screen.findByRole("button", { name: "Ver detalle del pedido #42" }));
    await user.click(await screen.findByRole("button", { name: "Pagar el pedido #42 con Mercado Pago" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos conectar con Mercado Pago");
    expect(irA).not.toHaveBeenCalled();
  });

  test.each(["pending", "rejected"])(
    "an unpaid order (%s) shows as pending payment in the list and can be paid from there",
    async (estadoPago) => {
      const user = userEvent.setup();
      obtenerHistorialCompras.mockResolvedValue([
        { ...compras[0], estadoPago },
        { ...compras[1], estadoPago: "approved" },
      ]);
      crearLinkPago.mockResolvedValue("https://mercadopago.test/pagar");

      renderHistorial();

      const lista = await screen.findByRole("list", { name: "Compras realizadas" });
      const [impago, pagado] = within(lista).getAllByRole("listitem");

      expect(within(impago).getByText("Pendiente de pago")).toBeInTheDocument();
      expect(within(impago).queryByText("Confirmado")).not.toBeInTheDocument();
      expect(within(pagado).getByText("Enviado")).toBeInTheDocument();
      expect(within(pagado).queryByRole("button", { name: /Pagar el pedido/ })).not.toBeInTheDocument();

      await user.click(within(impago).getByRole("button", { name: "Pagar el pedido #42 con Mercado Pago" }));

      expect(crearLinkPago).toHaveBeenCalledWith(42);
      expect(irA).toHaveBeenCalledWith("https://mercadopago.test/pagar");
    }
  );

  test("an unpaid order shows until when it can be paid", async () => {
    // Hoy a las 23:59, para que el texto sea "las 23:59" sin fecha.
    const vence = new Date();
    vence.setHours(23, 59, 0, 0);
    obtenerHistorialCompras.mockResolvedValue([
      { ...compras[0], estadoPago: "pending", vencePago: vence.toISOString() },
      { ...compras[1], estado: "confirmed", estadoPago: "rejected", vencePago: vence.toISOString() },
    ]);

    renderHistorial();

    const lista = await screen.findByRole("list", { name: "Compras realizadas" });
    const [pendiente, rechazado] = within(lista).getAllByRole("listitem");
    expect(within(pendiente).getByText("Pagalo antes de las 23:59")).toBeInTheDocument();
    expect(within(rechazado).getByText("Pago rechazado · Pagalo antes de las 23:59")).toBeInTheDocument();
  });

  test("an order cancelled for not being paid in time says so and cannot be paid", async () => {
    const user = userEvent.setup();
    const vencido = { ...compras[0], estado: "cancelled", estadoPago: "pending", metodoPago: "Mercado Pago" };
    obtenerHistorialCompras.mockResolvedValue([vencido]);
    obtenerDetalleCompra.mockResolvedValue(vencido);

    renderHistorial();

    const lista = await screen.findByRole("list", { name: "Compras realizadas" });
    expect(within(lista).getByText("Cancelado")).toBeInTheDocument();
    expect(within(lista).getByText("No se completó el pago a tiempo")).toBeInTheDocument();
    expect(within(lista).queryByRole("button", { name: /Pagar el pedido/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver detalle del pedido #42" }));

    expect(
      await screen.findByText("Este pedido se canceló porque no se completó el pago a tiempo")
    ).toBeInTheDocument();
    expect(screen.getByText("Mercado Pago (no se completó)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pagar el pedido/ })).not.toBeInTheDocument();
  });

  test("shows the products of each order in the list", async () => {
    obtenerHistorialCompras.mockResolvedValue([
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

  test("shows an empty-history message when the API returns no purchases", async () => {
    obtenerHistorialCompras.mockResolvedValue([]);

    renderHistorial();

    expect(
      await screen.findByText("Todavía no realizaste ninguna compra.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Cuando realices una compra, aparecerá acá.")
    ).toBeInTheDocument();
  });

  test("shows an API error instead of an empty-history message", async () => {
    obtenerHistorialCompras.mockRejectedValue(
      new Error("No pudimos cargar tu historial de compras.")
    );

    renderHistorial();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos cargar tu historial de compras."
    );
    expect(
      screen.queryByText("Todavía no realizaste ninguna compra.")
    ).not.toBeInTheDocument();
  });

  test("keeps the purchase list visible when a detail fails to load", async () => {
    obtenerHistorialCompras.mockResolvedValue(compras);
    obtenerDetalleCompra.mockRejectedValue(
      new Error("No pudimos cargar el detalle de la compra.")
    );

    renderHistorial();
    await userEvent.click(
      await screen.findByRole("button", { name: "Ver detalle del pedido #42" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos cargar el detalle de la compra."
    );
    expect(
      screen.getByRole("list", { name: "Compras realizadas" })
    ).toBeInTheDocument();
  });
});
