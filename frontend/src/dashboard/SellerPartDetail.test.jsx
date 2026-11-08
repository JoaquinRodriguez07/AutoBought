// Tests del detalle de un repuesto del vendedor.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

jest.mock("./dashboardApi");

import SellerPartDetail from "./SellerPartDetail";
import { adjustStock, getPartDetail } from "./dashboardApi";
import { mockChartSize } from "./chartTestUtils";

const MONTHS = [
  "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04",
  "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
];

const details = (extra = {}) => ({
  id: 7,
  code: "FRE-007",
  displayName: "Pastillas de freno Bosch",
  fabricante: "Bosch",
  categoria: "Frenos",
  price: 2500,
  stock: 38,
  stockLow: false,
  unitsSold: 360,
  months: MONTHS.map((month, i) => ({ month, units: 30, revenue: 75000, inProgress: i === 11 })),
  forecast: { month: "2026-11", units: 30 },
  projectedDemand: 30,
  dailyDemand: 1,
  coverageDays: 38,
  risk: "low",
  ...extra,
});

let restoreChart;

beforeEach(() => {
  restoreChart = mockChartSize();
  getPartDetail.mockResolvedValue(details());
});

afterEach(() => {
  restoreChart();
  jest.clearAllMocks();
});

function RouteEntry() {
  const { pathname, search } = useLocation();
  return <p data-testid="route">{pathname + search}</p>;
}

function renderDetail(estado) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/dashboard/repuestos/7", state: estado }]}>
      <Routes>
        <Route path="/dashboard/repuestos/:id" element={<SellerPartDetail />} />
        <Route path="/dashboard" element={<RouteEntry />} />
      </Routes>
    </MemoryRouter>
  );
}

// El título de un indicador también aparece en la leyenda y la tabla del gráfico.
// La tarjeta entera del indicador: título, número y detalle.
const indicador = (title) => screen.getByText(title, { selector: "p" }).parentElement.parentElement;

it("shows the stock, the units sold and the sales history of the part", async () => {
  const { container } = renderDetail();

  expect(await screen.findByRole("heading", { name: "Pastillas de freno Bosch" })).toBeInTheDocument();
  expect(getPartDetail).toHaveBeenCalledWith("7");
  expect(indicador("Stock actual")).toHaveTextContent("38");
  expect(indicador("Unidades vendidas")).toHaveTextContent("360");

  const chart = screen.getByRole("figure", { name: "Ventas reales y demanda proyectada de Pastillas de freno Bosch" });
  expect(within(chart).getAllByRole("row")).toHaveLength(14); // encabezado + 12 meses + proyección
  await waitFor(() => expect(container.querySelectorAll(".recharts-line").length).toBe(2));
});

it("shows the projected demand and the stockout risk", async () => {
  getPartDetail.mockResolvedValue(details({ stock: 10, coverageDays: 10, risk: "high" }));
  renderDetail();

  await screen.findByRole("heading", { name: "Pastillas de freno Bosch" });
  expect(indicador("Demanda proyectada")).toHaveTextContent("30");
  expect(indicador("Demanda proyectada")).toHaveTextContent("noviembre de 2026");
  expect(indicador("Cobertura")).toHaveTextContent("10 días");
  expect(indicador("Cobertura")).toHaveTextContent("Riesgo alto");
});

it("says that a part that was never sold has no sales yet", async () => {
  getPartDetail.mockResolvedValue(
    details({
      stock: 4,
      stockLow: true,
      unitsSold: 0,
      months: MONTHS.map((month) => ({ month, units: 0, revenue: 0, inProgress: false })),
      forecast: { month: "2026-11", units: 0 },
      projectedDemand: 0,
      coverageDays: null,
    })
  );
  renderDetail();

  expect(await screen.findByText("Este repuesto todavía no registra ventas")).toBeInTheDocument();
  expect(indicador("Stock actual")).toHaveTextContent("4");
  expect(indicador("Stock actual")).toHaveTextContent("Stock bajo");
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

it("adjusts the stock from 38 to 50 and reloads the part", async () => {
  const user = userEvent.setup();
  adjustStock.mockResolvedValue({ id: 7, stock: 50 });
  renderDetail();

  await user.click(await screen.findByRole("button", { name: "Ajustar stock" }));
  const dialogo = await screen.findByRole("dialog", { name: "Ajustar stock" });
  const field = within(dialogo).getByLabelText("Unidades disponibles");
  expect(field).toHaveValue("38");

  getPartDetail.mockResolvedValue(details({ stock: 50 }));
  await user.clear(field);
  await user.type(field, "50");
  await user.click(within(dialogo).getByRole("button", { name: "Guardar stock" }));

  expect(adjustStock).toHaveBeenCalledWith(7, "50");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(indicador("Stock actual")).toHaveTextContent("50"));
});

it("does not send a stock that is not a whole number", async () => {
  const user = userEvent.setup();
  renderDetail();

  await user.click(await screen.findByRole("button", { name: "Ajustar stock" }));
  const field = screen.getByLabelText("Unidades disponibles");
  await user.clear(field);
  await user.type(field, "-3");
  await user.click(screen.getByRole("button", { name: "Guardar stock" }));

  expect(screen.getByText("El stock es un número entero, 0 o más.")).toBeInTheDocument();
  expect(adjustStock).not.toHaveBeenCalled();
});

it("goes back to the dashboard keeping the filters", async () => {
  const user = userEvent.setup();
  renderDetail({ from: "?categoria=Frenos&periodo=3" });

  await user.click(await screen.findByRole("button", { name: "Volver al dashboard" }));

  expect(screen.getByTestId("route")).toHaveTextContent("/dashboard?categoria=Frenos&periodo=3");
});

it("shows the photo of the part, as the client sees it in the store", async () => {
  const user = userEvent.setup();
  renderDetail();

  const photo = await screen.findByRole("img", { name: "Foto de Pastillas de freno Bosch" });
  expect(photo).toHaveAttribute("src", "/repuestos/pastillas-freno.webp");

  await user.click(screen.getByRole("button", { name: "Ver foto 2" }));
  expect(screen.getByRole("img", { name: "Foto de Pastillas de freno Bosch" })).toHaveAttribute(
    "src",
    "/repuestos/pastillas-freno-vista.webp"
  );
});
