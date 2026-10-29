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
    expect(screen.getByText("Cantidad: 2")).toBeInTheDocument();
    expect(screen.getByText(/Precio unitario:.*900/)).toBeInTheDocument();
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
    expect(
      screen.getByText("Envío: Av. Italia 1234, Montevideo, Montevideo")
    ).toBeInTheDocument();
    expect(screen.getByText("Pago: Visa •••• 1234")).toBeInTheDocument();
    // Un pedido de antes de Mercado Pago ya está cobrado.
    expect(screen.queryByRole("button", { name: "PAGAR CON MERCADO PAGO" })).not.toBeInTheDocument();
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

    expect(await screen.findByText(`Pago: Mercado Pago (${texto})`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "PAGAR CON MERCADO PAGO" }));

    expect(crearLinkPago).toHaveBeenCalledWith(42);
    expect(irA).toHaveBeenCalledWith("https://mercadopago.test/pagar");
  });

  test("a paid order has no pay button", async () => {
    const user = userEvent.setup();
    obtenerHistorialCompras.mockResolvedValue(compras);
    obtenerDetalleCompra.mockResolvedValue({ ...compras[0], metodoPago: "Mercado Pago", estadoPago: "approved" });

    renderHistorial();
    await user.click(await screen.findByRole("button", { name: "Ver detalle del pedido #42" }));

    expect(await screen.findByText("Pago: Mercado Pago")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PAGAR CON MERCADO PAGO" })).not.toBeInTheDocument();
  });

  test("shows the error when Mercado Pago cannot be opened", async () => {
    const user = userEvent.setup();
    obtenerHistorialCompras.mockResolvedValue(compras);
    obtenerDetalleCompra.mockResolvedValue({ ...compras[0], metodoPago: "Mercado Pago", estadoPago: "pending" });
    crearLinkPago.mockRejectedValue(new Error("No pudimos conectar con Mercado Pago. Probá de nuevo en un rato."));

    renderHistorial();
    await user.click(await screen.findByRole("button", { name: "Ver detalle del pedido #42" }));
    await user.click(await screen.findByRole("button", { name: "PAGAR CON MERCADO PAGO" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos conectar con Mercado Pago");
    expect(irA).not.toHaveBeenCalled();
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
