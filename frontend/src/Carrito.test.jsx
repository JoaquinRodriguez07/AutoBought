import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Carrito from "./Carrito";
import { confirmarCompra, obtenerDirecciones, obtenerMetodosPago } from "./api";
import { useCart } from "./context/CartContext";

// api.js usa import.meta.env (Vite) y CartContext necesita el router y
// la sesión: en estos tests se reemplazan por dobles controlados.
jest.mock("./api", () => ({
  confirmarCompra: jest.fn(),
  obtenerDirecciones: jest.fn(),
  obtenerMetodosPago: jest.fn(),
}));

jest.mock("./context/CartContext", () => ({
  useCart: jest.fn(),
}));

// La sección de sugerencias (HU 3.2) tiene sus propios tests.
jest.mock("./SugerenciasCarrito", () => () => null);

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
const tarjeta = (id, numero, principal, vencida = false) => ({
  id, tipo: "Visa", titular: "Ana", numero, vencimiento: vencida ? "01/20" : "12/30", principal, vencida,
});

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
      <Carrito onCatalogo={jest.fn()} onDetalle={jest.fn()} {...props} />
    </MemoryRouter>
  );
}

// Abre el modal y espera a que terminen de cargar direcciones y tarjetas.
async function abrirConfirmacion(user) {
  await user.click(screen.getByRole("button", { name: "FINALIZAR COMPRA" }));
  await waitFor(() =>
    expect(screen.queryByText("Cargando tus datos de envío y pago...")).not.toBeInTheDocument()
  );
  return screen.getByRole("dialog");
}

beforeEach(() => {
  jest.clearAllMocks();
  obtenerDirecciones.mockResolvedValue([direccion(1, "Av. Italia", true)]);
  obtenerMetodosPago.mockResolvedValue([tarjeta(7, "1234", true)]);
});

describe("Carrito: confirmación de compra (HU 1.9)", () => {
  test("Compra confirmada: muestra el identificador del pedido y refresca el carrito", async () => {
    const user = userEvent.setup();
    const cargarCarrito = conCarrito([pastillas, filtro]);
    confirmarCompra.mockResolvedValue({ id: 42, total: 5000, items: [] });

    renderCarrito();
    const dialogo = await abrirConfirmacion(user);
    expect(within(dialogo).getByText("Pastillas de freno × 2")).toBeInTheDocument();
    expect(within(dialogo).getByText("Filtro de aire × 1")).toBeInTheDocument();
    expect(within(dialogo).getByText(`$${(5000).toLocaleString("es-UY")}`)).toBeInTheDocument();

    await user.click(within(dialogo).getByRole("button", { name: "CONFIRMAR COMPRA" }));

    expect(await screen.findByText("#42")).toBeInTheDocument();
    expect(confirmarCompra).toHaveBeenCalledWith({ direccionId: 1, metodoPagoId: 7 });
    expect(cargarCarrito).toHaveBeenCalledTimes(1);
  });

  test("Error por stock: muestra qué repuesto no alcanza", async () => {
    const user = userEvent.setup();
    const cargarCarrito = conCarrito([filtro]);
    const error = new Error("No hay stock suficiente de 'Filtro de aire': pediste 1, hay 0.");
    error.status = 409;
    confirmarCompra.mockRejectedValue(error);

    renderCarrito();
    await abrirConfirmacion(user);
    await user.click(screen.getByRole("button", { name: "CONFIRMAR COMPRA" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No hay stock suficiente de 'Filtro de aire'"
    );
    expect(screen.queryByText("¡Compra confirmada!")).not.toBeInTheDocument();
    expect(cargarCarrito).not.toHaveBeenCalled();
  });

  test("Botón deshabilitado con el carrito vacío", () => {
    conCarrito([]);

    renderCarrito();

    expect(screen.getByRole("button", { name: "FINALIZAR COMPRA" })).toBeDisabled();
  });
});

describe("Carrito: dirección de envío y método de pago", () => {
  test("Preselecciona los principales y confirma con los elegidos", async () => {
    const user = userEvent.setup();
    conCarrito([pastillas]);
    obtenerDirecciones.mockResolvedValue([
      direccion(1, "Av. Italia", false),
      direccion(2, "Bv. Artigas", true),
    ]);
    obtenerMetodosPago.mockResolvedValue([tarjeta(7, "1234", true), tarjeta(8, "9876", false)]);
    confirmarCompra.mockResolvedValue({ id: 50, total: 2000, items: [] });

    renderCarrito();
    const dialogo = await abrirConfirmacion(user);

    const selectorDireccion = within(dialogo).getByLabelText("DIRECCIÓN DE ENVÍO");
    const selectorPago = within(dialogo).getByLabelText("MÉTODO DE PAGO");
    expect(selectorDireccion).toHaveValue("2");
    expect(selectorPago).toHaveValue("7");

    await user.selectOptions(selectorPago, "Visa •••• 9876");
    await user.click(within(dialogo).getByRole("button", { name: "CONFIRMAR COMPRA" }));

    expect(await screen.findByText("#50")).toBeInTheDocument();
    expect(confirmarCompra).toHaveBeenCalledWith({ direccionId: 2, metodoPagoId: 8 });
  });

  test("Sin dirección guardada: muestra un enlace para agregarla y no deja confirmar", async () => {
    const user = userEvent.setup();
    const onDirecciones = jest.fn();
    conCarrito([pastillas]);
    obtenerDirecciones.mockResolvedValue([]);

    renderCarrito({ onDirecciones });
    const dialogo = await abrirConfirmacion(user);

    expect(within(dialogo).getByRole("button", { name: "CONFIRMAR COMPRA" })).toBeDisabled();
    await user.click(within(dialogo).getByRole("button", { name: "Agregar una dirección" }));
    expect(onDirecciones).toHaveBeenCalledTimes(1);
    expect(confirmarCompra).not.toHaveBeenCalled();
  });

  test("Sin tarjeta guardada: muestra un enlace para agregarla y no deja confirmar", async () => {
    const user = userEvent.setup();
    const onMetodosPago = jest.fn();
    conCarrito([pastillas]);
    obtenerMetodosPago.mockResolvedValue([]);

    renderCarrito({ onMetodosPago });
    const dialogo = await abrirConfirmacion(user);

    expect(within(dialogo).getByRole("button", { name: "CONFIRMAR COMPRA" })).toBeDisabled();
    await user.click(within(dialogo).getByRole("button", { name: "Agregar una tarjeta" }));
    expect(onMetodosPago).toHaveBeenCalledTimes(1);
  });

  test("Las tarjetas vencidas no se pueden elegir y se preselecciona una vigente", async () => {
    const user = userEvent.setup();
    conCarrito([pastillas]);
    obtenerMetodosPago.mockResolvedValue([tarjeta(7, "1234", true, true), tarjeta(8, "9876", false)]);

    renderCarrito();
    const dialogo = await abrirConfirmacion(user);

    expect(within(dialogo).getByLabelText("MÉTODO DE PAGO")).toHaveValue("8");
    expect(within(dialogo).getByRole("option", { name: "Visa •••• 1234 (vencida)" })).toBeDisabled();
    expect(within(dialogo).getByRole("button", { name: "CONFIRMAR COMPRA" })).toBeEnabled();
  });

  test("Si todas las tarjetas están vencidas, pide agregar una y no deja confirmar", async () => {
    const user = userEvent.setup();
    const onMetodosPago = jest.fn();
    conCarrito([pastillas]);
    obtenerMetodosPago.mockResolvedValue([tarjeta(7, "1234", true, true)]);

    renderCarrito({ onMetodosPago });
    const dialogo = await abrirConfirmacion(user);

    expect(within(dialogo).getByText(/Tus tarjetas guardadas están vencidas/)).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "CONFIRMAR COMPRA" })).toBeDisabled();
    await user.click(within(dialogo).getByRole("button", { name: "Agregar una tarjeta" }));
    expect(onMetodosPago).toHaveBeenCalledTimes(1);
  });
});
