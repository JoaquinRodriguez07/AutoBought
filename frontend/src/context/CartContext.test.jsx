import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { Link, MemoryRouter, useLocation } from "react-router-dom";

import { CartProvider, useCart } from "./CartContext";
import {
  updateCartItem,
  addCartItem,
  removeCartItem,
  getCart,
  clearCartApi,
} from "../api";
import { isSeller, getSession, isSessionValid } from "../auth";

jest.mock("../api", () => ({
  updateCartItem: jest.fn(),
  addCartItem: jest.fn(),
  removeCartItem: jest.fn(),
  getCart: jest.fn(),
  clearCartApi: jest.fn(),
}));

jest.mock("../auth", () => ({
  isSeller: jest.fn(),
  getSession: jest.fn(),
  isSessionValid: jest.fn(),
}));

jest.mock("react-hot-toast", () => ({ __esModule: true, default: { error: jest.fn() } }));

// El aviso tiene sus propios tests: acá solo importa cuándo aparece y qué
// hace cada una de sus acciones.
jest.mock("../AddedToCartNotice", () => ({ aviso, onClose, onUndo, onSeeCart, onStartSession }) =>
  aviso ? (
    <div role="status" aria-label={aviso.tipo}>
      <p>{aviso.product?.id}</p>
      <p>×{aviso.addedQuantity}</p>
      <button onClick={onClose}>Cerrar</button>
      <button onClick={onUndo}>Deshacer</button>
      <button onClick={onSeeCart}>Ver carrito</button>
      <button onClick={onStartSession}>Iniciar sesión</button>
    </div>
  ) : null
);

const carritoVacio = { items: [], total: 0 };
const linea = { id: "21", partId: 21, quantity: 2, stock: 5 };
const carritoConLinea = { items: [linea], total: 4900 };
const producto = { id: "21", partId: 21, stock: 5 };

let carrito;

function Consumidor() {
  carrito = useCart();
  const { pathname } = useLocation();
  return (
    <>
      <p>Ruta: {pathname}</p>
      <Link to="/otra">Ir a otra pantalla</Link>
    </>
  );
}

async function montar(inicial = carritoVacio) {
  getCart.mockResolvedValue(inicial);
  render(
    <MemoryRouter initialEntries={["/catalogo"]}>
      <CartProvider>
        <Consumidor />
      </CartProvider>
    </MemoryRouter>
  );
  await waitFor(() => expect(carrito.total).toBe(inicial.total));
}

const usar = (accion) => act(async () => accion());

const errorConStatus = (status, message) => Object.assign(new Error(message), { status });

beforeEach(() => {
  jest.resetAllMocks();
  getSession.mockReturnValue({ token: "t" });
  isSessionValid.mockReturnValue(true);
  isSeller.mockReturnValue(false);
});

it("requires a provider to use the hook", () => {
  jest.spyOn(console, "error").mockImplementation(() => {});

  expect(() =>
    render(
      <MemoryRouter>
        <Consumidor />
      </MemoryRouter>
    )
  ).toThrow("useCart debe usarse dentro de un CartProvider");

  console.error.mockRestore();
});

describe("loading the cart", () => {
  it("loads the cart of the session and counts its units", async () => {
    await montar(carritoConLinea);

    expect(carrito.cart).toEqual([linea]);
    expect(carrito.cartQuantity).toBe(2);
    expect(carrito.total).toBe(4900);
  });

  it("does not ask for a cart without a session", async () => {
    isSessionValid.mockReturnValue(false);

    await montar();

    expect(getCart).not.toHaveBeenCalled();
  });

  it("does not ask for a cart for a seller", async () => {
    isSeller.mockReturnValue(true);

    await montar();

    expect(getCart).not.toHaveBeenCalled();
  });

  it("empties the cart when the session is gone at reload", async () => {
    await montar(carritoConLinea);
    isSessionValid.mockReturnValue(false);

    await usar(() => carrito.loadCart());

    expect(carrito.cart).toEqual([]);
    expect(carrito.total).toBe(0);
  });

  it("warns about a failed load", async () => {
    await montar();
    getCart.mockRejectedValue(errorConStatus(500, "Se rompió."));

    await usar(() => carrito.loadCart());

    expect(toast.error).toHaveBeenCalledWith("Se rompió.");
  });

  it("uses a default message for a failed load without one", async () => {
    await montar();
    getCart.mockRejectedValue(errorConStatus(500, ""));

    await usar(() => carrito.loadCart());

    expect(toast.error).toHaveBeenCalledWith("No pudimos cargar tu carrito.");
  });

  it("stays quiet on a 401, which App.jsx handles", async () => {
    await montar();
    getCart.mockRejectedValue(errorConStatus(401, "Sesión vencida."));

    await usar(() => carrito.loadCart());

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("clears the screen on logout without calling the API", async () => {
    await montar(carritoConLinea);

    await usar(() => carrito.clearCartLocal());

    expect(carrito.cart).toEqual([]);
    expect(carrito.total).toBe(0);
    expect(clearCartApi).not.toHaveBeenCalled();
  });
});

describe("addToCart", () => {
  const agregar = async (...args) => {
    let resultado;
    await usar(async () => {
      resultado = await carrito.addToCart(...args);
    });
    return resultado;
  };

  it("sends the visitor to log in instead of adding", async () => {
    isSessionValid.mockReturnValue(false);
    await montar();

    expect(await agregar(producto)).toBe(false);

    expect(addCartItem).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "login" })).toBeInTheDocument();
  });

  it("does not let a seller buy", async () => {
    isSeller.mockReturnValue(true);
    await montar();

    expect(await agregar(producto)).toBe(false);

    expect(toast.error).toHaveBeenCalledWith("Los vendedores no pueden comprar.");
    expect(addCartItem).not.toHaveBeenCalled();
  });

  it.each([
    ["no product", null],
    ["a product without stock", { id: "1", stock: 0 }],
  ])("ignores %s", async (_nombre, valor) => {
    await montar();

    expect(await agregar(valor)).toBe(false);

    expect(addCartItem).not.toHaveBeenCalled();
  });

  it("adds the part, updates the cart and confirms it", async () => {
    await montar();
    addCartItem.mockResolvedValue(carritoConLinea);

    expect(await agregar(producto, 2)).toBe(true);

    expect(addCartItem).toHaveBeenCalledWith(21, 2);
    expect(carrito.total).toBe(4900);
    expect(screen.getByRole("status", { name: "added" })).toHaveTextContent("×2");
  });

  it("falls back to the id of a product without partId", async () => {
    await montar();
    addCartItem.mockResolvedValue(carritoConLinea);

    await agregar({ id: 33, stock: 1 });

    expect(addCartItem).toHaveBeenCalledWith(33, 1);
  });

  it.each([[0], [-3], ["abc"], [undefined]])("adds at least one unit when asked for %p", async (cantidad) => {
    await montar();
    addCartItem.mockResolvedValue(carritoConLinea);

    await agregar(producto, cantidad);

    expect(addCartItem).toHaveBeenCalledWith(21, 1);
  });

  it("adds to the open notice when the same part is added again", async () => {
    await montar();
    addCartItem.mockResolvedValue(carritoConLinea);

    await agregar(producto, 1);
    await agregar(producto, 2);

    expect(screen.getByRole("status", { name: "added" })).toHaveTextContent("×3");
  });

  it("replaces the notice when a different part is added", async () => {
    await montar();
    addCartItem.mockResolvedValue(carritoConLinea);

    await agregar(producto, 3);
    await agregar({ id: "22", partId: 22, stock: 5 }, 1);

    const aviso = screen.getByRole("status", { name: "added" });
    expect(aviso).toHaveTextContent("22");
    expect(aviso).toHaveTextContent("×1");
  });

  it("can add without a notice", async () => {
    await montar();
    addCartItem.mockResolvedValue(carritoConLinea);

    expect(await agregar(producto, 1, { aviso: false })).toBe(true);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  describe("without enough stock", () => {
    const sinStock = errorConStatus(409, "No hay stock suficiente. Disponible: 5");

    beforeEach(() => addCartItem.mockRejectedValue(sinStock));

    it.each([
      ["the cart already has everything", [{ ...linea, quantity: 5 }], producto, "Ya tenés en el carrito las 5 unidades disponibles."],
      ["there are units left in the cart", [linea], producto, "Solo quedan 5 unidades y ya tenés 2 en el carrito."],
      ["the part is not in the cart", [], producto, "Solo quedan 5 unidades."],
      ["a single unit remains", [], { ...producto, stock: 1 }, "Solo queda 1 unidad."],
    ])("explains it when %s", async (_caso, items, valor, mensaje) => {
      await montar({ items, total: 1 });

      expect(await agregar(valor)).toBe(false);

      expect(toast.error).toHaveBeenCalledWith(mensaje);
    });

    it("uses the backend message when the stock is unknown", async () => {
      await montar();

      await agregar({ id: "9", partId: 9 });

      expect(toast.error).toHaveBeenCalledWith(sinStock.message);
    });
  });

  it("warns about any other error", async () => {
    await montar();
    addCartItem.mockRejectedValue(errorConStatus(500, ""));

    expect(await agregar(producto)).toBe(false);

    expect(toast.error).toHaveBeenCalledWith("No pudimos actualizar el carrito.");
  });

  it("stays quiet on a 401", async () => {
    await montar();
    addCartItem.mockRejectedValue(errorConStatus(401, "Sesión vencida."));

    await agregar(producto);

    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("changing the cart", () => {
  it("ignores a quantity below one", async () => {
    await montar(carritoConLinea);

    await usar(() => carrito.updateQuantity("21", 0));

    expect(updateCartItem).not.toHaveBeenCalled();
  });

  it("updates a line by its part id", async () => {
    await montar(carritoConLinea);
    updateCartItem.mockResolvedValue({ items: [{ ...linea, quantity: 3 }], total: 7350 });

    await usar(() => carrito.updateQuantity("21", 3));

    expect(updateCartItem).toHaveBeenCalledWith(21, 3);
    expect(carrito.total).toBe(7350);
  });

  it("uses the given id for a line that is not loaded", async () => {
    await montar();
    updateCartItem.mockResolvedValue(carritoVacio);
    removeCartItem.mockResolvedValue(carritoVacio);

    await usar(() => carrito.updateQuantity(99, 3));
    await usar(() => carrito.removeFromCart(99));

    expect(updateCartItem).toHaveBeenCalledWith(99, 3);
    expect(removeCartItem).toHaveBeenCalledWith(99);
  });

  it("warns when a quantity cannot be changed", async () => {
    await montar(carritoConLinea);
    updateCartItem.mockRejectedValue(errorConStatus(409, "No hay stock."));

    await usar(() => carrito.updateQuantity("21", 9));

    expect(toast.error).toHaveBeenCalledWith("No hay stock.");
    expect(carrito.cart).toEqual([linea]);
  });

  it("removes a line by its part id", async () => {
    await montar(carritoConLinea);
    removeCartItem.mockResolvedValue(carritoVacio);

    await usar(() => carrito.removeFromCart("21"));

    expect(removeCartItem).toHaveBeenCalledWith(21);
    expect(carrito.cart).toEqual([]);
  });

  it("warns when a line cannot be removed", async () => {
    await montar(carritoConLinea);
    removeCartItem.mockRejectedValue(errorConStatus(404, "Ya no está."));

    await usar(() => carrito.removeFromCart("21"));

    expect(toast.error).toHaveBeenCalledWith("Ya no está.");
  });

  it("empties the cart", async () => {
    await montar(carritoConLinea);
    clearCartApi.mockResolvedValue(carritoVacio);

    await usar(() => carrito.clearCart());

    expect(carrito.cartQuantity).toBe(0);
  });

  it("warns when the cart cannot be emptied", async () => {
    await montar(carritoConLinea);
    clearCartApi.mockRejectedValue(errorConStatus(500, "Se rompió."));

    await usar(() => carrito.clearCart());

    expect(toast.error).toHaveBeenCalledWith("Se rompió.");
    expect(carrito.cartQuantity).toBe(2);
  });
});

describe("the added notice", () => {
  async function agregarConAviso(inicial, respuesta) {
    await montar(inicial);
    addCartItem.mockResolvedValue(respuesta);
    await usar(() => carrito.addToCart(producto, 1));
  }

  it("undoing keeps the units the cart already had", async () => {
    await agregarConAviso(carritoConLinea, { items: [{ ...linea, quantity: 3 }], total: 7350 });
    updateCartItem.mockResolvedValue(carritoConLinea);

    await userEvent.click(screen.getByRole("button", { name: "Deshacer" }));

    expect(updateCartItem).toHaveBeenCalledWith(21, 2);
    expect(removeCartItem).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("undoing removes the line when it had no other units", async () => {
    await agregarConAviso(carritoVacio, { items: [{ ...linea, quantity: 1 }], total: 2450 });
    removeCartItem.mockResolvedValue(carritoVacio);

    await userEvent.click(screen.getByRole("button", { name: "Deshacer" }));

    expect(removeCartItem).toHaveBeenCalledWith(21);
    expect(updateCartItem).not.toHaveBeenCalled();
  });

  it("closes with its button", async () => {
    await agregarConAviso(carritoVacio, carritoConLinea);

    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("goes to the cart", async () => {
    await agregarConAviso(carritoVacio, carritoConLinea);

    await userEvent.click(screen.getByRole("button", { name: "Ver carrito" }));

    expect(screen.getByText("Ruta: /carrito")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("goes to the login", async () => {
    isSessionValid.mockReturnValue(false);
    await montar();
    await usar(() => carrito.addToCart(producto));

    await userEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(screen.getByText("Ruta: /login")).toBeInTheDocument();
  });

  it("closes when the route changes", async () => {
    await agregarConAviso(carritoVacio, carritoConLinea);

    await userEvent.click(screen.getByRole("link", { name: "Ir a otra pantalla" }));

    expect(screen.getByText("Ruta: /otra")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
