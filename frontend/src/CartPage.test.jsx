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

const itemCart = (partId, displayName, price, quantity, stock = 10) => ({
  id: String(partId),
  partId,
  displayName,
  price,
  quantity,
  stock,
  image: "imagen.jpg",
});

const shippingAddress = (id, street, primary) => ({
  id, displayName: "Ana", street, number: "1234", apartamento: "", city: "Montevideo",
  departamento: "Montevideo", codePostal: "", primary,
});
const LINK_MP = "https://mercadopago.test/checkout/pref-1";

const pads = itemCart(1, "Pastillas de freno", 1000, 2);
const filter = itemCart(2, "Filtro de aire", 3000, 1);

function withCart(cart, loadCart = jest.fn().mockResolvedValue(undefined)) {
  const total = cart.reduce((suma, item) => suma + item.price * item.quantity, 0);
  useCart.mockReturnValue({
    cart,
    total,
    cartQuantity: cart.reduce((suma, item) => suma + item.quantity, 0),
    updateQuantity: jest.fn(),
    removeFromCart: jest.fn(),
    clearCart: jest.fn(),
    loadCart,
  });
  return loadCart;
}

function renderCart(props = {}) {
  // La Navbar incluye la búsqueda libre, que usa useNavigate: hace falta un router.
  return render(
    <MemoryRouter>
      <CartPage onCatalogo={jest.fn()} onDetail={jest.fn()} {...props} />
    </MemoryRouter>
  );
}

// Abre el modal y espera a que terminen de cargar las direcciones.
async function openConfirmation(user) {
  await user.click(screen.getByRole("button", { name: "Finalizar compra" }));
  await waitFor(() =>
    expect(screen.queryByText("Cargando tus direcciones...")).not.toBeInTheDocument()
  );
  return screen.getByRole("dialog");
}

beforeEach(() => {
  jest.clearAllMocks();
  getAddresses.mockResolvedValue([shippingAddress(1, "Av. Italia", true)]);
  createPaymentLink.mockResolvedValue(LINK_MP);
});

describe("Carrito: productos", () => {
  test("Muestra el código de cada repuesto, para distinguir los que tienen el mismo nombre", () => {
    withCart([
      { ...itemCart(1, "Radiador Valeo", 8700, 1), code: "COL-0001" },
      { ...itemCart(2, "Radiador Valeo", 9100, 1), code: "COL-0002" },
    ]);

    renderCart();

    expect(screen.getByText("Código: COL-0001")).toBeInTheDocument();
    expect(screen.getByText("Código: COL-0002")).toBeInTheDocument();
  });
});

describe("Carrito: confirmación de compra (HU 1.9)", () => {
  test("Al confirmar crea el pedido, refresca el carrito y lleva a pagar a Mercado Pago", async () => {
    const user = userEvent.setup();
    const loadCart = withCart([pads, filter]);
    confirmPurchase.mockResolvedValue({ id: 42, total: 5000, items: [] });

    renderCart();
    const dialogo = await openConfirmation(user);
    expect(within(dialogo).getByText("Pastillas de freno × 2")).toBeInTheDocument();
    expect(within(dialogo).getByText("Filtro de aire × 1")).toBeInTheDocument();
    expect(within(dialogo).getByText(`$${(5000).toLocaleString("es-UY")}`)).toBeInTheDocument();

    await user.click(within(dialogo).getByRole("button", { name: "Ir a pagar" }));

    expect(await screen.findByText("Pedido #42")).toBeInTheDocument();
    expect(confirmPurchase).toHaveBeenCalledWith({ idAddress: 1 });
    expect(loadCart).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(goTo).toHaveBeenCalledWith(LINK_MP));
    expect(createPaymentLink).toHaveBeenCalledWith(42);
  });

  test("Si no se puede abrir Mercado Pago, el pedido queda creado y se puede reintentar", async () => {
    const user = userEvent.setup();
    const onHistory = jest.fn();
    withCart([pads]);
    confirmPurchase.mockResolvedValue({ id: 42, total: 2000, items: [] });
    createPaymentLink
      .mockRejectedValueOnce(new Error("No pudimos conectar con Mercado Pago. Probá de nuevo en un rato."))
      .mockResolvedValueOnce(LINK_MP);

    renderCart({ onHistory });
    await openConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Ir a pagar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos conectar con Mercado Pago");
    expect(goTo).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Reintentar pago" }));

    await waitFor(() => expect(goTo).toHaveBeenCalledWith(LINK_MP));
    expect(confirmPurchase).toHaveBeenCalledTimes(1);
  });

  test("Error por stock: muestra qué repuesto no alcanza", async () => {
    const user = userEvent.setup();
    const loadCart = withCart([filter]);
    const error = new Error("No hay stock suficiente de 'Filtro de aire': pediste 1, hay 0.");
    error.status = 409;
    confirmPurchase.mockRejectedValue(error);

    renderCart();
    await openConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Ir a pagar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No hay stock suficiente de 'Filtro de aire'"
    );
    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(goTo).not.toHaveBeenCalled();
    expect(loadCart).not.toHaveBeenCalled();
  });

  test("Botón deshabilitado con el carrito vacío", () => {
    withCart([]);

    renderCart();

    expect(screen.getByRole("button", { name: "Finalizar compra" })).toBeDisabled();
  });
});

describe("Carrito: dirección de envío", () => {
  test("Preselecciona la principal y confirma con la elegida", async () => {
    const user = userEvent.setup();
    withCart([pads]);
    getAddresses.mockResolvedValue([
      shippingAddress(1, "Av. Italia", false),
      shippingAddress(2, "Bv. Artigas", true),
    ]);
    confirmPurchase.mockResolvedValue({ id: 50, total: 2000, items: [] });

    renderCart();
    const dialogo = await openConfirmation(user);

    const selectorAddress = within(dialogo).getByLabelText("DIRECCIÓN DE ENVÍO");
    expect(selectorAddress).toHaveValue("2");

    await user.selectOptions(selectorAddress, "Av. Italia 1234, Montevideo");
    await user.click(within(dialogo).getByRole("button", { name: "Ir a pagar" }));

    expect(await screen.findByText("Pedido #50")).toBeInTheDocument();
    expect(confirmPurchase).toHaveBeenCalledWith({ idAddress: 1 });
  });

  test("Sin dirección guardada: muestra un enlace para agregarla y no deja confirmar", async () => {
    const user = userEvent.setup();
    const onAddresses = jest.fn();
    withCart([pads]);
    getAddresses.mockResolvedValue([]);

    renderCart({ onAddresses });
    const dialogo = await openConfirmation(user);

    expect(within(dialogo).getByRole("button", { name: "Ir a pagar" })).toBeDisabled();
    await user.click(within(dialogo).getByRole("button", { name: "Agregar una dirección" }));
    expect(onAddresses).toHaveBeenCalledTimes(1);
    expect(confirmPurchase).not.toHaveBeenCalled();
  });
});
