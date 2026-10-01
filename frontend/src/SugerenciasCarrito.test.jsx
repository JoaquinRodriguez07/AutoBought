import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SugerenciasCarrito from "./SugerenciasCarrito";
import { obtenerRecomendaciones } from "./api";
import { useCart } from "./context/CartContext";

// api.js usa import.meta.env (Vite) y CartContext necesita el router y
// la sesión: en estos tests se reemplazan por dobles controlados.
jest.mock("./api", () => ({
  obtenerRecomendaciones: jest.fn(),
}));

jest.mock("./context/CartContext", () => ({
  useCart: jest.fn(),
}));

const TITULO = "También podrías necesitar esto...";

const itemCarrito = (partId, nombre) => ({
  id: String(partId),
  partId,
  nombre,
  precio: 1000,
  cantidad: 1,
  stock: 10,
});

const sugerencia = (partId, nombre) => ({
  id: String(partId),
  partId,
  nombre,
  codigo: `COD-${partId}`,
  categoria: "Frenos",
  precio: 2500,
  stock: 5,
  marca: "Chevrolet",
  marcaPrincipal: "Chevrolet",
  imagen: "imagen.jpg",
});

const pastillas = itemCarrito(1, "Pastillas de freno delanteras Chevrolet Onix");
const discos = sugerencia(2, "Discos de freno Chevrolet Onix");
const liquido = sugerencia(3, "Líquido de frenos DOT4");
const amortiguador = sugerencia(4, "Amortiguador delantero Chevrolet Onix");
const radiador = sugerencia(5, "Radiador Chevrolet Onix");

function conCarrito(cart, addToCart = jest.fn()) {
  useCart.mockReturnValue({ cart, addToCart });
  return addToCart;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("SugerenciasCarrito (HU 3.2)", () => {
  test("Ver sugerencias al abrir el carrito: muestra la sección con 1 a 3 repuestos", async () => {
    conCarrito([pastillas]);
    obtenerRecomendaciones.mockResolvedValue([
      discos,
      liquido,
      amortiguador,
      radiador,
    ]);

    render(<SugerenciasCarrito />);

    expect(
      await screen.findByRole("heading", { name: TITULO })
    ).toBeInTheDocument();
    expect(obtenerRecomendaciones).toHaveBeenCalledWith([1]);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText(radiador.nombre)).not.toBeInTheDocument();
  });

  test("Agregar una sugerencia sin salir del carrito: llama a addToCart y deja de mostrarse", async () => {
    const usuario = userEvent.setup();
    const addToCart = conCarrito([pastillas]);
    obtenerRecomendaciones.mockResolvedValue([discos, liquido]);

    const { rerender } = render(<SugerenciasCarrito />);

    await usuario.click(
      await screen.findByRole("button", {
        name: `Agregar ${discos.nombre} al carrito`,
      })
    );

    expect(addToCart).toHaveBeenCalledWith(discos, 1);

    // El carrito ya trae el repuesto agregado (lo actualiza CartContext).
    conCarrito([pastillas, itemCarrito(discos.partId, discos.nombre)], addToCart);
    rerender(<SugerenciasCarrito />);

    await waitFor(() =>
      expect(screen.queryByText(discos.nombre)).not.toBeInTheDocument()
    );
    expect(screen.getByText(liquido.nombre)).toBeInTheDocument();
  });

  test("Carrito vacío: no se muestra la sección ni se consulta la API", () => {
    conCarrito([]);

    const { container } = render(<SugerenciasCarrito />);

    expect(container).toBeEmptyDOMElement();
    expect(obtenerRecomendaciones).not.toHaveBeenCalled();
  });

  test("Falla del servicio de recomendaciones: el carrito se ve sin la sección", async () => {
    conCarrito([pastillas]);
    // obtenerRecomendaciones devuelve [] cuando el servicio falla.
    obtenerRecomendaciones.mockResolvedValue([]);

    const { container } = render(<SugerenciasCarrito />);

    await waitFor(() => expect(obtenerRecomendaciones).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});