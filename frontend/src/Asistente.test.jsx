import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Asistente from "./Asistente";
import { consultarAsistente } from "./api";
import { useCart } from "./context/CartContext";
import { useVehicle } from "./context/VehicleContext";

jest.mock("./api", () => ({ consultarAsistente: jest.fn() }));
jest.mock("./context/CartContext", () => ({ useCart: jest.fn() }));
jest.mock("./context/VehicleContext", () => ({
  useVehicle: jest.fn(),
  vehiculoCompleto: (v) => Boolean(v?.brand && v?.model && v?.year),
}));
jest.mock("./Navbar", () => () => <nav aria-label="Navegación" />);

const ONIX = { brand: "Chevrolet", model: "Onix", year: "2016" };

const pastillas = {
  id: "11", partId: 11, nombre: "Pastillas de freno delanteras Bosch", fabricante: "Bosch",
  codigo: "BRK-0011", precio: 2800, stock: 5, imagen: "/repuestos/pastillas-freno.webp",
};

const respuesta = {
  diagnostico: "Parece que las pastillas de freno están gastadas.",
  urgencia: "alta",
  aviso: "Si los frenos fallan, no manejes.",
  pregunta: "¿El ruido es al frenar suave o fuerte?",
  fueraDeTema: false,
  recomendaciones: [{ tipo: "Pastillas de freno", motivo: "El chillido es el indicador de desgaste.", repuestos: [pastillas] }],
};

function RutaActual() {
  const { pathname, search } = useLocation();
  return <p data-testid="ruta">{pathname}{search}</p>;
}

function renderAsistente({ vehiculo = ONIX, props = {} } = {}) {
  useVehicle.mockReturnValue({ vehiculoActivo: vehiculo });
  return render(
    <MemoryRouter initialEntries={["/asistente"]}>
      <Routes>
        <Route path="*" element={<><Asistente onHome={jest.fn()} onDetalle={jest.fn()} {...props} /><RutaActual /></>} />
      </Routes>
    </MemoryRouter>
  );
}

let addToCart;

beforeEach(() => {
  addToCart = jest.fn().mockResolvedValue(true);
  useCart.mockReturnValue({ addToCart, deshacerAgregado: jest.fn() });
  consultarAsistente.mockReset();
});

describe("Asistente", () => {
  it("asks to choose the vehicle before consulting", async () => {
    const onHome = jest.fn();
    renderAsistente({ vehiculo: null, props: { onHome } });

    expect(screen.getByRole("heading", { name: "Primero elegí tu vehículo" })).toBeInTheDocument();
    expect(screen.queryByLabelText("¿Qué le pasa a tu auto?")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ELEGIR VEHÍCULO" }));
    expect(onHome).toHaveBeenCalled();
  });

  it("sends the symptom with the active vehicle and shows the diagnosis and compatible parts", async () => {
    const user = userEvent.setup();
    consultarAsistente.mockResolvedValue(respuesta);
    renderAsistente();

    expect(screen.getByText("Chevrolet Onix 2016")).toBeInTheDocument();
    await user.type(screen.getByLabelText("¿Qué le pasa a tu auto?"), "chilla al frenar");
    await user.click(screen.getByRole("button", { name: "CONSULTAR" }));

    expect(consultarAsistente).toHaveBeenCalledWith({ texto: "chilla al frenar", marca: "Chevrolet", modelo: "Onix", anio: "2016" });
    expect(await screen.findByText(respuesta.diagnostico)).toBeInTheDocument();
    expect(screen.getByText("Urgencia alta")).toBeInTheDocument();
    expect(screen.getByText("Si los frenos fallan, no manejes.")).toBeInTheDocument();
    expect(screen.getByText(/¿El ruido es al frenar suave o fuerte\?/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pastillas de freno" })).toBeInTheDocument();
    expect(screen.getByText("El chillido es el indicador de desgaste.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: pastillas.nombre })).toHaveAttribute("src", pastillas.imagen);
    expect(screen.getByText(/no reemplaza la revisión de un mecánico/)).toBeInTheDocument();
  });

  it("adds a recommended part to the cart and opens its detail", async () => {
    const user = userEvent.setup();
    const onDetalle = jest.fn();
    consultarAsistente.mockResolvedValue(respuesta);
    renderAsistente({ props: { onDetalle } });

    await user.click(screen.getByRole("button", { name: "Chilla cuando freno" }));
    await user.click(screen.getByRole("button", { name: "CONSULTAR" }));
    await user.click(await screen.findByRole("button", { name: /Agregar al carrito/ }));

    expect(addToCart).toHaveBeenCalledWith(pastillas, 1);
    await user.click(screen.getByRole("button", { name: "Ver detalle" }));
    expect(onDetalle).toHaveBeenCalledWith(pastillas);
  });

  it("offers the normal search when the assistant is not available", async () => {
    const user = userEvent.setup();
    const error = new Error("El asistente no está disponible en este momento.");
    error.status = 503;
    consultarAsistente.mockRejectedValue(error);
    renderAsistente();

    await user.type(screen.getByLabelText("¿Qué le pasa a tu auto?"), "no arranca");
    await user.click(screen.getByRole("button", { name: "CONSULTAR" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no está disponible");
    await user.click(screen.getByRole("button", { name: 'BUSCAR "no arranca" EN EL CATÁLOGO' }));
    expect(screen.getByTestId("ruta")).toHaveTextContent("/catalogo?q=no%20arranca");
  });

  it("explains the daily limit without offering a search", async () => {
    const user = userEvent.setup();
    const error = new Error("Llegaste al límite de consultas al asistente por hoy.");
    error.status = 429;
    consultarAsistente.mockRejectedValue(error);
    renderAsistente();

    await user.type(screen.getByLabelText("¿Qué le pasa a tu auto?"), "no arranca");
    await user.click(screen.getByRole("button", { name: "CONSULTAR" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("límite");
    expect(screen.queryByRole("button", { name: /EN EL CATÁLOGO/ })).not.toBeInTheDocument();
  });

  it("does not show parts nor urgency for an off-topic question", async () => {
    const user = userEvent.setup();
    consultarAsistente.mockResolvedValue({
      ...respuesta, urgencia: "baja", aviso: null, pregunta: null, fueraDeTema: true, recomendaciones: [],
      diagnostico: "Solo puedo ayudarte con problemas del auto.",
    });
    renderAsistente();

    await user.type(screen.getByLabelText("¿Qué le pasa a tu auto?"), "¿quién ganó el partido?");
    await user.click(screen.getByRole("button", { name: "CONSULTAR" }));

    expect(await screen.findByText("Solo puedo ayudarte con problemas del auto.")).toBeInTheDocument();
    expect(screen.queryByText("Mantenimiento")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Agregar al carrito/ })).not.toBeInTheDocument();
  });

  it("does not consult with less than 3 characters", async () => {
    renderAsistente();

    await userEvent.type(screen.getByLabelText("¿Qué le pasa a tu auto?"), "ab");

    expect(screen.getByRole("button", { name: "CONSULTAR" })).toBeDisabled();
    await waitFor(() => expect(consultarAsistente).not.toHaveBeenCalled());
  });
});
