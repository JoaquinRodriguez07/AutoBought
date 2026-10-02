import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Carrito from "./Carrito";
import { confirmarCompra } from "./api";
import { useCart } from "./context/CartContext";

// api.js usa import.meta.env (Vite) y CartContext necesita el router y
// la sesión: en estos tests se reemplazan por dobles controlados.
jest.mock("./api", () => ({
  confirmarCompra: jest.fn(),
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

function renderCarrito() {
  return render(<Carrito onCatalogo={jest.fn()} onDetalle={jest.fn()} />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Carrito: confirmación de compra (HU 1.9)", () => {
  test("Compra confirmada: muestra el identificador del pedido y refresca el carrito", async () => {
    const user = userEvent.setup();
    const cargarCarrito = conCarrito([pastillas, filtro]);
    confirmarCompra.mockResolvedValue({ id: 42, total: 5000, items: [] });

    renderCarrito();
    await user.click(screen.getByRole("button", { name: "FINALIZAR COMPRA" }));

    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText("Pastillas de freno × 2")).toBeInTheDocument();
    expect(within(dialogo).getByText("Filtro de aire × 1")).toBeInTheDocument();
    expect(within(dialogo).getByText(`$${(5000).toLocaleString("es-UY")}`)).toBeInTheDocument();

    await user.click(within(dialogo).getByRole("button", { name: "CONFIRMAR COMPRA" }));

    expect(await screen.findByText("#42")).toBeInTheDocument();
    expect(confirmarCompra).toHaveBeenCalledTimes(1);
    expect(cargarCarrito).toHaveBeenCalledTimes(1);
  });

  test("Error por stock: muestra qué repuesto no alcanza", async () => {
    const user = userEvent.setup();
    const cargarCarrito = conCarrito([filtro]);
    const error = new Error("No hay stock suficiente de 'Filtro de aire': pediste 1, hay 0.");
    error.status = 409;
    confirmarCompra.mockRejectedValue(error);

    renderCarrito();
    await user.click(screen.getByRole("button", { name: "FINALIZAR COMPRA" }));
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
