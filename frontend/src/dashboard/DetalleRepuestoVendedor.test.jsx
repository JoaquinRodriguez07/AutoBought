import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

jest.mock("./apiDashboard");

import DetalleRepuestoVendedor from "./DetalleRepuestoVendedor";
import { ajustarStock, obtenerDetalleRepuesto } from "./apiDashboard";
import { simularTamanioDelGrafico } from "./testGrafico";

const MESES = [
  "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04",
  "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
];

const detalle = (extra = {}) => ({
  id: 7,
  codigo: "FRE-007",
  nombre: "Pastillas de freno Bosch",
  fabricante: "Bosch",
  categoria: "Frenos",
  precio: 2500,
  stock: 38,
  stockBajo: false,
  unidadesVendidas: 360,
  meses: MESES.map((mes, i) => ({ mes, unidades: 30, facturacion: 75000, enCurso: i === 11 })),
  proyeccion: { mes: "2026-11", unidades: 30 },
  demandaProyectada: 30,
  demandaDiaria: 1,
  diasCobertura: 38,
  riesgo: "low",
  ...extra,
});

let restaurarGrafico;

beforeEach(() => {
  restaurarGrafico = simularTamanioDelGrafico();
  obtenerDetalleRepuesto.mockResolvedValue(detalle());
});

afterEach(() => {
  restaurarGrafico();
  jest.clearAllMocks();
});

function Ruta() {
  const { pathname, search } = useLocation();
  return <p data-testid="ruta">{pathname + search}</p>;
}

function renderDetalle(estado) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/dashboard/repuestos/7", state: estado }]}>
      <Routes>
        <Route path="/dashboard/repuestos/:id" element={<DetalleRepuestoVendedor />} />
        <Route path="/dashboard" element={<Ruta />} />
      </Routes>
    </MemoryRouter>
  );
}

// El título de un indicador también aparece en la leyenda y la tabla del gráfico.
// La tarjeta entera del indicador: título, número y detalle.
const indicador = (titulo) => screen.getByText(titulo, { selector: "p" }).parentElement.parentElement;

it("shows the stock, the units sold and the sales history of the part", async () => {
  const { container } = renderDetalle();

  expect(await screen.findByRole("heading", { name: "Pastillas de freno Bosch" })).toBeInTheDocument();
  expect(obtenerDetalleRepuesto).toHaveBeenCalledWith("7");
  expect(indicador("Stock actual")).toHaveTextContent("38");
  expect(indicador("Unidades vendidas")).toHaveTextContent("360");

  const grafico = screen.getByRole("figure", { name: "Ventas reales y demanda proyectada de Pastillas de freno Bosch" });
  expect(within(grafico).getAllByRole("row")).toHaveLength(14); // encabezado + 12 meses + proyección
  await waitFor(() => expect(container.querySelectorAll(".recharts-line").length).toBe(2));
});

it("shows the projected demand and the stockout risk", async () => {
  obtenerDetalleRepuesto.mockResolvedValue(detalle({ stock: 10, diasCobertura: 10, riesgo: "high" }));
  renderDetalle();

  await screen.findByRole("heading", { name: "Pastillas de freno Bosch" });
  expect(indicador("Demanda proyectada")).toHaveTextContent("30");
  expect(indicador("Demanda proyectada")).toHaveTextContent("noviembre de 2026");
  expect(indicador("Cobertura")).toHaveTextContent("10 días");
  expect(indicador("Cobertura")).toHaveTextContent("Riesgo alto");
});

it("says that a part that was never sold has no sales yet", async () => {
  obtenerDetalleRepuesto.mockResolvedValue(
    detalle({
      stock: 4,
      stockBajo: true,
      unidadesVendidas: 0,
      meses: MESES.map((mes) => ({ mes, unidades: 0, facturacion: 0, enCurso: false })),
      proyeccion: { mes: "2026-11", unidades: 0 },
      demandaProyectada: 0,
      diasCobertura: null,
    })
  );
  renderDetalle();

  expect(await screen.findByText("Este repuesto todavía no registra ventas")).toBeInTheDocument();
  expect(indicador("Stock actual")).toHaveTextContent("4");
  expect(indicador("Stock actual")).toHaveTextContent("Stock bajo");
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

it("adjusts the stock from 38 to 50 and reloads the part", async () => {
  const user = userEvent.setup();
  ajustarStock.mockResolvedValue({ id: 7, stock: 50 });
  renderDetalle();

  await user.click(await screen.findByRole("button", { name: "Ajustar stock" }));
  const dialogo = await screen.findByRole("dialog", { name: "Ajustar stock" });
  const campo = within(dialogo).getByLabelText("Unidades disponibles");
  expect(campo).toHaveValue("38");

  obtenerDetalleRepuesto.mockResolvedValue(detalle({ stock: 50 }));
  await user.clear(campo);
  await user.type(campo, "50");
  await user.click(within(dialogo).getByRole("button", { name: "Guardar stock" }));

  expect(ajustarStock).toHaveBeenCalledWith(7, "50");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(indicador("Stock actual")).toHaveTextContent("50"));
});

it("does not send a stock that is not a whole number", async () => {
  const user = userEvent.setup();
  renderDetalle();

  await user.click(await screen.findByRole("button", { name: "Ajustar stock" }));
  const campo = screen.getByLabelText("Unidades disponibles");
  await user.clear(campo);
  await user.type(campo, "-3");
  await user.click(screen.getByRole("button", { name: "Guardar stock" }));

  expect(screen.getByText("El stock es un número entero, 0 o más.")).toBeInTheDocument();
  expect(ajustarStock).not.toHaveBeenCalled();
});

it("goes back to the dashboard keeping the filters", async () => {
  const user = userEvent.setup();
  renderDetalle({ desde: "?categoria=Frenos&periodo=3" });

  await user.click(await screen.findByRole("button", { name: "Volver al dashboard" }));

  expect(screen.getByTestId("ruta")).toHaveTextContent("/dashboard?categoria=Frenos&periodo=3");
});
