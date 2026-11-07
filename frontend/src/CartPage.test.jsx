// Tests de la pantalla del carrito.

import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CartPage from "./CartPage";
import { confirmPurchase, createPaymentLink, getAddresses } from "./api";
import { useCart } from "./context/CartContext";
import { goTo } from "./redirect";

// api.js usa import.meta.env (Vite) y CartContext necesita el router y
// la sesión: en estos tests se reemplazan por dobles controlados.
jest.mock("./api", () => ({
  confirmPurchase: jest.fn(),
  createPaymentLink: jest.fn(),
  getAddresses: jest.fn(),
}));

// jsdom no navega a otras páginas: se registra adónde se habría ido.
jest.mock("./redirect", () => ({ goTo: jest.fn() }));

jest.mock("./context/CartContext", () => ({
  useCart: jest.fn(),
}));

// La sección de sugerencias (HU 3.2) tiene sus propios tests.
jest.mock("./CartSuggestions", () => () => null);

const itemCarrito = (partId, nombre, precio, cantidad, stock = 10) => ({
  id: String(partId),
  partId,
  nombre,
  precio,
  cantidad,
  stock,
  imagen: "imagen.jpg",
});

const direccion = (id, calle, principal) => ({
  id, nombre: "Ana", calle, numero: "1234", apartamento: "", ciudad: "Montevideo",
  departamento: "Montevideo", codigoPostal: "", principal,
});
const LINK_MP = "https://mercadopago.test/checkout/pref-1";

const pastillas = itemCarrito(1, "Pastillas de freno", 1000, 2);
const filtro = itemCarrito(2, "Filtro de aire", 3000, 1);

function conCarrito(cart, cargarCarrito = jest.fn().mockResolvedValue(undefined)) {
  const total = cart.reduce((suma, item) => suma + item.precio * item.cantidad, 0);
  useCart.mockReturnValue({
    cart,
    total,
    cantidadCarrito: cart.reduce((suma, item) => suma + item.cantidad, 0),
    updateQuantity: jest.fn(),
    removeFromCart: jest.fn(),
    clearCart: jest.fn(),
    cargarCarrito,
  });
  return cargarCarrito;
}

function renderCarrito(props = {}) {
  // La Navbar incluye la búsqueda libre, que usa useNavigate: hace falta un router.
  return render(
    <MemoryRouter>
      <CartPage onCatalogo={jest.fn()} onDetalle={jest.fn()} {...props} />
    </MemoryRouter>
  );
}

// Abre el modal y espera a que terminen de cargar las direcciones.
async function abrirConfirmacion(user) {
  await user.click(screen.getByRole("button", { name: "Finalizar compra" }));
  await waitFor(() =>
    expect(screen.queryByText("Cargando tus direcciones...")).not.toBeInTheDocument()
  );
  return screen.getByRole("dialog");
}

beforeEach(() => {
  jest.clearAllMocks();
  getAddresses.mockResolvedValue([direccion(1, "Av. Italia", true)]);
  createPaymentLink.mockResolvedValue(LINK_MP);
});

describe("Carrito: productos", () => {
  test("Muestra el código de cada repuesto, para distinguir los que tienen el mismo nombre", () => {
    conCarrito([
      { ...itemCarrito(1, "Radiador Valeo", 8700, 1), codigo: "COL-0001" },
      { ...itemCarrito(2, "Radiador Valeo", 9100, 1), codigo: "COL-0002" },
    ]);

    renderCarrito();

    expect(screen.getByText("Código: COL-0001")).toBeInTheDocument();
    expect(screen.getByText("Código: COL-0002")).toBeInTheDocument();
  });
});

describe("Carrito: confirmación de compra (HU 1.9)", () => {
  test("Al confirmar crea el pedido, refresca el carrito y lleva a pagar a Mercado Pago", async () => {
    const user = userEvent.setup();
    const cargarCarrito = conCarrito([pastillas, filtro]);
    confirmPurchase.mockResolvedValue({ id: 42, total: 5000, items: [] });

    renderCarrito();
    const dialogo = await abrirConfirmacion(user);
    expect(within(dialogo).getByText("Pastillas de freno × 2")).toBeInTheDocument();
    expect(within(dialogo).getByText("Filtro de aire × 1")).toBeInTheDocument();
    expect(within(dialogo).getByText(`$${(5000).toLocaleString("es-UY")}`)).toBeInTheDocument();

    await user.click(within(dialogo).getByRole("button", { name: "Ir a pagar" }));

    expect(await screen.findByText("Pedido #42")).toBeInTheDocument();
    expect(confirmPurchase).toHaveBeenCalledWith({ direccionId: 1 });
    expect(cargarCarrito).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(goTo).toHaveBeenCalledWith(LINK_MP));
    expect(createPaymentLink).toHaveBeenCalledWith(42);
  });

  test("Si no se puede abrir Mercado Pago, el pedido queda creado y se puede reintentar", async () => {
    const user = userEvent.setup();
    const onHistorial = jest.fn();
    conCarrito([pastillas]);
    confirmPurchase.mockResolvedValue({ id: 42, total: 2000, items: [] });
    createPaymentLink
      .mockRejectedValueOnce(new Error("No pudimos conectar con Mercado Pago. Probá de nuevo en un rato."))
      .mockResolvedValueOnce(LINK_MP);

    renderCarrito({ onHistorial });
    await abrirConfirmacion(user);
    await user.click(screen.getByRole("button", { name: "Ir a pagar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos conectar con Mercado Pago");
    expect(goTo).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Reintentar pago" }));

    await waitFor(() => expect(goTo).toHaveBeenCalledWith(LINK_MP));
    expect(confirmPurchase).toHaveBeenCalledTimes(1);
  });

  test("Error por stock: muestra qué repuesto no alcanza", async () => {
    const user = userEvent.setup();
    const cargarCarrito = conCarrito([filtro]);
    const error = new Error("No hay stock suficiente de 'Filtro de aire': pediste 1, hay 0.");
    error.status = 409;
    confirmPurchase.mockRejectedValue(error);

    renderCarrito();
    await abrirConfirmacion(user);
    await user.click(screen.getByRole("button", { name: "Ir a pagar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No hay stock suficiente de 'Filtro de aire'"
    );
    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(goTo).not.toHaveBeenCalled();
    expect(cargarCarrito).not.toHaveBeenCalled();
  });

  test("Botón deshabilitado con el carrito vacío", () => {
    conCarrito([]);

    renderCarrito();

    expect(screen.getByRole("button", { name: "Finalizar compra" })).toBeDisabled();
  });
});

describe("Carrito: dirección de envío", () => {
  test("Preselecciona la principal y confirma con la elegida", async () => {
    const user = userEvent.setup();
    conCarrito([pastillas]);
    getAddresses.mockResolvedValue([
      direccion(1, "Av. Italia", false),
      direccion(2, "Bv. Artigas", true),
    ]);
    confirmPurchase.mockResolvedValue({ id: 50, total: 2000, items: [] });

    renderCarrito();
    const dialogo = await abrirConfirmacion(user);

    const selectorDireccion = within(dialogo).getByLabelText("DIRECCIÓN DE ENVÍO");
    expect(selectorDireccion).toHaveValue("2");

    await user.selectOptions(selectorDireccion, "Av. Italia 1234, Montevideo");
    await user.click(within(dialogo).getByRole("button", { name: "Ir a pagar" }));

    expect(await screen.findByText("Pedido #50")).toBeInTheDocument();
    expect(confirmPurchase).toHaveBeenCalledWith({ direccionId: 1 });
  });

  test("Sin dirección guardada: muestra un enlace para agregarla y no deja confirmar", async () => {
    const user = userEvent.setup();
    const onDirecciones = jest.fn();
    conCarrito([pastillas]);
    getAddresses.mockResolvedValue([]);

    renderCarrito({ onDirecciones });
    const dialogo = await abrirConfirmacion(user);

    expect(within(dialogo).getByRole("button", { name: "Ir a pagar" })).toBeDisabled();
    await user.click(within(dialogo).getByRole("button", { name: "Agregar una dirección" }));
    expect(onDirecciones).toHaveBeenCalledTimes(1);
    expect(confirmPurchase).not.toHaveBeenCalled();
  });
});
