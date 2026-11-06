import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { Link, MemoryRouter, useLocation } from "react-router-dom";

import { CartProvider, useCart } from "./CartContext";
import {
  actualizarItemCarrito,
  agregarItemCarrito,
  eliminarItemCarrito,
  obtenerCarrito,
  vaciarCarritoAPI,
} from "../api";
import { esVendedor, obtenerSesion, sesionValida } from "../auth";

jest.mock("../api", () => ({
  actualizarItemCarrito: jest.fn(),
  agregarItemCarrito: jest.fn(),
  eliminarItemCarrito: jest.fn(),
  obtenerCarrito: jest.fn(),
  vaciarCarritoAPI: jest.fn(),
}));

jest.mock("../auth", () => ({
  esVendedor: jest.fn(),
  obtenerSesion: jest.fn(),
  sesionValida: jest.fn(),
}));

jest.mock("react-hot-toast", () => ({ __esModule: true, default: { error: jest.fn() } }));

// El aviso tiene sus propios tests: acá solo importa cuándo aparece y qué
// hace cada una de sus acciones.
jest.mock("../ConfirmacionAgregarCarrito", () => ({ aviso, onCerrar, onDeshacer, onVerCarrito, onIniciarSesion }) =>
  aviso ? (
    <div role="status" aria-label={aviso.tipo}>
      <p>{aviso.producto?.id}</p>
      <p>×{aviso.cantidadAgregada}</p>
      <button onClick={onCerrar}>Cerrar</button>
      <button onClick={onDeshacer}>Deshacer</button>
      <button onClick={onVerCarrito}>Ver carrito</button>
      <button onClick={onIniciarSesion}>Iniciar sesión</button>
    </div>
  ) : null
);

const carritoVacio = { items: [], total: 0 };
const linea = { id: "21", partId: 21, cantidad: 2, stock: 5 };
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
  obtenerCarrito.mockResolvedValue(inicial);
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
  jest.clearAllMocks();
  obtenerSesion.mockReturnValue({ token: "t" });
  sesionValida.mockReturnValue(true);
  esVendedor.mockReturnValue(false);
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
    expect(carrito.cantidadCarrito).toBe(2);
    expect(carrito.total).toBe(4900);
  });

  it("does not ask for a cart without a session", async () => {
    sesionValida.mockReturnValue(false);

    await montar();

    expect(obtenerCarrito).not.toHaveBeenCalled();
  });

  it("does not ask for a cart for a seller", async () => {
    esVendedor.mockReturnValue(true);

    await montar();

    expect(obtenerCarrito).not.toHaveBeenCalled();
  });

  it("empties the cart when the session is gone at reload", async () => {
    await montar(carritoConLinea);
    sesionValida.mockReturnValue(false);

    await usar(() => carrito.cargarCarrito());

    expect(carrito.cart).toEqual([]);
    expect(carrito.total).toBe(0);
  });

  it("warns about a failed load", async () => {
    await montar();
    obtenerCarrito.mockRejectedValue(errorConStatus(500, "Se rompió."));

    await usar(() => carrito.cargarCarrito());

    expect(toast.error).toHaveBeenCalledWith("Se rompió.");
  });

  it("uses a default message for a failed load without one", async () => {
    await montar();
    obtenerCarrito.mockRejectedValue(errorConStatus(500, ""));

    await usar(() => carrito.cargarCarrito());

    expect(toast.error).toHaveBeenCalledWith("No pudimos cargar tu carrito.");
  });

  it("stays quiet on a 401, which App.jsx handles", async () => {
    await montar();
    obtenerCarrito.mockRejectedValue(errorConStatus(401, "Sesión vencida."));

    await usar(() => carrito.cargarCarrito());

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("clears the screen on logout without calling the API", async () => {
    await montar(carritoConLinea);

    await usar(() => carrito.limpiarCarritoLocal());

    expect(carrito.cart).toEqual([]);
    expect(carrito.total).toBe(0);
    expect(vaciarCarritoAPI).not.toHaveBeenCalled();
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
    sesionValida.mockReturnValue(false);
    await montar();

    expect(await agregar(producto)).toBe(false);

    expect(agregarItemCarrito).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "login" })).toBeInTheDocument();
  });

  it("does not let a seller buy", async () => {
    esVendedor.mockReturnValue(true);
    await montar();

    expect(await agregar(producto)).toBe(false);

    expect(toast.error).toHaveBeenCalledWith("Los vendedores no pueden comprar.");
    expect(agregarItemCarrito).not.toHaveBeenCalled();
  });

  it.each([
    ["no product", null],
    ["a product without stock", { id: "1", stock: 0 }],
  ])("ignores %s", async (_nombre, valor) => {
    await montar();

    expect(await agregar(valor)).toBe(false);

    expect(agregarItemCarrito).not.toHaveBeenCalled();
  });

  it("adds the part, updates the cart and confirms it", async () => {
    await montar();
    agregarItemCarrito.mockResolvedValue(carritoConLinea);

    expect(await agregar(producto, 2)).toBe(true);

    expect(agregarItemCarrito).toHaveBeenCalledWith(21, 2);
    expect(carrito.total).toBe(4900);
    expect(screen.getByRole("status", { name: "agregado" })).toHaveTextContent("×2");
  });

  it("falls back to the id of a product without partId", async () => {
    await montar();
    agregarItemCarrito.mockResolvedValue(carritoConLinea);

    await agregar({ id: 33, stock: 1 });

    expect(agregarItemCarrito).toHaveBeenCalledWith(33, 1);
  });

  it.each([[0], [-3], ["abc"], [undefined]])("adds at least one unit when asked for %p", async (cantidad) => {
    await montar();
    agregarItemCarrito.mockResolvedValue(carritoConLinea);

    await agregar(producto, cantidad);

    expect(agregarItemCarrito).toHaveBeenCalledWith(21, 1);
  });

  it("adds to the open notice when the same part is added again", async () => {
    await montar();
    agregarItemCarrito.mockResolvedValue(carritoConLinea);

    await agregar(producto, 1);
    await agregar(producto, 2);

    expect(screen.getByRole("status", { name: "agregado" })).toHaveTextContent("×3");
  });

  it("replaces the notice when a different part is added", async () => {
    await montar();
    agregarItemCarrito.mockResolvedValue(carritoConLinea);

    await agregar(producto, 3);
    await agregar({ id: "22", partId: 22, stock: 5 }, 1);

    const aviso = screen.getByRole("status", { name: "agregado" });
    expect(aviso).toHaveTextContent("22");
    expect(aviso).toHaveTextContent("×1");
  });

  it("can add without a notice", async () => {
    await montar();
    agregarItemCarrito.mockResolvedValue(carritoConLinea);

    expect(await agregar(producto, 1, { aviso: false })).toBe(true);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  describe("without enough stock", () => {
    const sinStock = errorConStatus(409, "No hay stock suficiente. Disponible: 5");

    beforeEach(() => agregarItemCarrito.mockRejectedValue(sinStock));

    it.each([
      ["the cart already has everything", [{ ...linea, cantidad: 5 }], producto, "Ya tenés en el carrito las 5 unidades disponibles."],
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
    agregarItemCarrito.mockRejectedValue(errorConStatus(500, ""));

    expect(await agregar(producto)).toBe(false);

    expect(toast.error).toHaveBeenCalledWith("No pudimos actualizar el carrito.");
  });

  it("stays quiet on a 401", async () => {
    await montar();
    agregarItemCarrito.mockRejectedValue(errorConStatus(401, "Sesión vencida."));

    await agregar(producto);

    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("changing the cart", () => {
  it("ignores a quantity below one", async () => {
    await montar(carritoConLinea);

    await usar(() => carrito.updateQuantity("21", 0));

    expect(actualizarItemCarrito).not.toHaveBeenCalled();
  });

  it("updates a line by its part id", async () => {
    await montar(carritoConLinea);
    actualizarItemCarrito.mockResolvedValue({ items: [{ ...linea, cantidad: 3 }], total: 7350 });

    await usar(() => carrito.updateQuantity("21", 3));

    expect(actualizarItemCarrito).toHaveBeenCalledWith(21, 3);
    expect(carrito.total).toBe(7350);
  });

  it("uses the given id for a line that is not loaded", async () => {
    await montar();
    actualizarItemCarrito.mockResolvedValue(carritoVacio);
    eliminarItemCarrito.mockResolvedValue(carritoVacio);

    await usar(() => carrito.updateQuantity(99, 3));
    await usar(() => carrito.removeFromCart(99));

    expect(actualizarItemCarrito).toHaveBeenCalledWith(99, 3);
    expect(eliminarItemCarrito).toHaveBeenCalledWith(99);
  });

  it("warns when a quantity cannot be changed", async () => {
    await montar(carritoConLinea);
    actualizarItemCarrito.mockRejectedValue(errorConStatus(409, "No hay stock."));

    await usar(() => carrito.updateQuantity("21", 9));

    expect(toast.error).toHaveBeenCalledWith("No hay stock.");
    expect(carrito.cart).toEqual([linea]);
  });

  it("removes a line by its part id", async () => {
    await montar(carritoConLinea);
    eliminarItemCarrito.mockResolvedValue(carritoVacio);

    await usar(() => carrito.removeFromCart("21"));

    expect(eliminarItemCarrito).toHaveBeenCalledWith(21);
    expect(carrito.cart).toEqual([]);
  });

  it("warns when a line cannot be removed", async () => {
    await montar(carritoConLinea);
    eliminarItemCarrito.mockRejectedValue(errorConStatus(404, "Ya no está."));

    await usar(() => carrito.removeFromCart("21"));

    expect(toast.error).toHaveBeenCalledWith("Ya no está.");
  });

  it("empties the cart", async () => {
    await montar(carritoConLinea);
    vaciarCarritoAPI.mockResolvedValue(carritoVacio);

    await usar(() => carrito.clearCart());

    expect(carrito.cantidadCarrito).toBe(0);
  });

  it("warns when the cart cannot be emptied", async () => {
    await montar(carritoConLinea);
    vaciarCarritoAPI.mockRejectedValue(errorConStatus(500, "Se rompió."));

    await usar(() => carrito.clearCart());

    expect(toast.error).toHaveBeenCalledWith("Se rompió.");
    expect(carrito.cantidadCarrito).toBe(2);
  });
});

describe("the added notice", () => {
  async function agregarConAviso(inicial, respuesta) {
    await montar(inicial);
    agregarItemCarrito.mockResolvedValue(respuesta);
    await usar(() => carrito.addToCart(producto, 1));
  }

  it("undoing keeps the units the cart already had", async () => {
    await agregarConAviso(carritoConLinea, { items: [{ ...linea, cantidad: 3 }], total: 7350 });
    actualizarItemCarrito.mockResolvedValue(carritoConLinea);

    await userEvent.click(screen.getByRole("button", { name: "Deshacer" }));

    expect(actualizarItemCarrito).toHaveBeenCalledWith(21, 2);
    expect(eliminarItemCarrito).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("undoing removes the line when it had no other units", async () => {
    await agregarConAviso(carritoVacio, { items: [{ ...linea, cantidad: 1 }], total: 2450 });
    eliminarItemCarrito.mockResolvedValue(carritoVacio);

    await userEvent.click(screen.getByRole("button", { name: "Deshacer" }));

    expect(eliminarItemCarrito).toHaveBeenCalledWith(21);
    expect(actualizarItemCarrito).not.toHaveBeenCalled();
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
    sesionValida.mockReturnValue(false);
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
