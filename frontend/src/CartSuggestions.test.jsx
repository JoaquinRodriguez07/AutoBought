// Tests de las sugerencias del carrito.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CartSuggestions from "./CartSuggestions";
import { getRecommendations } from "./api";
import { useCart } from "./context/CartContext";

// api.js usa import.meta.env (Vite) y CartContext necesita el router y
// la sesión: en estos tests se reemplazan por dobles controlados.
jest.mock("./api", () => ({
  getRecommendations: jest.fn(),
}));

jest.mock("./context/CartContext", () => ({
  useCart: jest.fn(),
}));

const TITLE = "Te puede servir también";

const itemCart = (partId, displayName) => ({
  id: String(partId),
  partId,
  displayName,
  price: 1000,
  quantity: 1,
  stock: 10,
});

const suggestionItem = (partId, displayName) => ({
  id: String(partId),
  partId,
  displayName,
  code: `COD-${partId}`,
  categoria: "Frenos",
  price: 2500,
  stock: 5,
  marca: "Chevrolet",
  primaryBrand: "Chevrolet",
  image: "imagen.jpg",
});

const pads = itemCart(1, "Pastillas de freno delanteras Chevrolet Onix");
const discos = suggestionItem(2, "Discos de freno Chevrolet Onix");
const fluid = suggestionItem(3, "Líquido de frenos DOT4");
const amortiguador = suggestionItem(4, "Amortiguador delantero Chevrolet Onix");
const radiador = suggestionItem(5, "Radiador Chevrolet Onix");

function withCart(cart, addToCart = jest.fn()) {
  useCart.mockReturnValue({ cart, addToCart });
  return addToCart;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("SugerenciasCarrito (HU 3.2)", () => {
  test("opens the detail of a suggestion with its real product", async () => {
    const sessionUser = userEvent.setup();
    const onDetail = jest.fn();
    withCart([pads]);
    getRecommendations.mockResolvedValue([discos]);

    render(<CartSuggestions onDetail={onDetail} />);

    await sessionUser.click(await screen.findByRole("button", { name: discos.displayName }));

    expect(onDetail).toHaveBeenCalledWith(discos);
  });

  test("Ver sugerencias al abrir el carrito: muestra la sección con 1 a 3 repuestos", async () => {
    withCart([pads]);
    getRecommendations.mockResolvedValue([
      discos,
      fluid,
      amortiguador,
      radiador,
    ]);

    render(<CartSuggestions />);

    expect(
      await screen.findByRole("heading", { name: TITLE })
    ).toBeInTheDocument();
    expect(getRecommendations).toHaveBeenCalledWith([1]);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText(radiador.displayName)).not.toBeInTheDocument();
  });

  test("Agregar una sugerencia sin salir del carrito: llama a addToCart y deja de mostrarse", async () => {
    const sessionUser = userEvent.setup();
    const addToCart = withCart([pads]);
    getRecommendations.mockResolvedValue([discos, fluid]);

    const { rerender } = render(<CartSuggestions />);

    await sessionUser.click(
      await screen.findByRole("button", {
        name: `Agregar ${discos.displayName} al carrito`,
      })
    );

    expect(addToCart).toHaveBeenCalledWith(discos, 1, { aviso: false });

    // El carrito ya trae el repuesto agregado (lo actualiza CartContext).
    withCart([pads, itemCart(discos.partId, discos.displayName)], addToCart);
    rerender(<CartSuggestions />);

    await waitFor(() =>
      expect(screen.queryByText(discos.displayName)).not.toBeInTheDocument()
    );
    expect(screen.getByText(fluid.displayName)).toBeInTheDocument();
  });

  test("Carrito vacío: no se muestra la sección ni se consulta la API", () => {
    withCart([]);

    const { container } = render(<CartSuggestions />);

    expect(container).toBeEmptyDOMElement();
    expect(getRecommendations).not.toHaveBeenCalled();
  });

  test("Falla del servicio de recomendaciones: el carrito se ve sin la sección", async () => {
    withCart([pads]);
    // obtenerRecomendaciones devuelve [] cuando el servicio falla.
    getRecommendations.mockResolvedValue([]);

    const { container } = render(<CartSuggestions />);

    await waitFor(() => expect(getRecommendations).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
