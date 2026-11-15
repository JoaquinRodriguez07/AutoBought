// Tests del portal del vendedor.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";

jest.mock("./dashboardApi");
jest.mock("../api", () => ({ getCategories: jest.fn() }));

import Dashboard from "./Dashboard";
import { getCategories } from "../api";
import {
  adjustStock,
  unpublishedFeature,
  getSalesTrend,
  getBestSellers,
  getOrders,
  getDemandForecast,
  getAISummary,
  getStockoutRisk,
  getStock,
} from "./dashboardApi";
import { mockChartSize } from "./chartTestUtils";

const part = (id, extra = {}) => ({
  id,
  code: `FRE-00${id}`,
  displayName: `Repuesto ${id}`,
  fabricante: "Bosch",
  categoria: "Frenos",
  stock: 10,
  ...extra,
});

const MONTHS = [
  "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04",
  "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
];

const trend = {
  months: MONTHS.map((month, i) => ({ month, units: 10 + i, revenue: (10 + i) * 1000, inProgress: i === 11 })),
  forecast: { month: "2026-11", units: 40 },
};

const alertas = {
  month: "2026-11",
  umbrales: { high: 15, medium: 30 },
  repuestos: [
    { ...part(1, { displayName: "Pastillas Bosch", stock: 10 }), projectedDemand: 60, dailyDemand: 2, coverageDays: 5, risk: "high" },
    { ...part(2, { displayName: "Discos Fremax", stock: 20 }), projectedDemand: 30, dailyDemand: 1, coverageDays: 20, risk: "medium" },
  ],
};

let restoreChart;

beforeEach(() => {
  restoreChart = mockChartSize();
  // El resumen con IA (HU 6.3) tiene sus propios tests (IA.test.jsx): acá
  // el backend todavía no lo tiene.
  unpublishedFeature.mockImplementation(jest.requireActual("./dashboardApi").unpublishedFeature);
  getAISummary.mockRejectedValue(Object.assign(new Error("No encontrado"), { status: 404 }));
  getCategories.mockResolvedValue([
    { displayName: "Filtros", quantity: 2 },
    { displayName: "Frenos", quantity: 3 },
  ]);
  getStock.mockResolvedValue({
    thresholdStockLow: 5,
    repuestos: [
      { ...part(1, { displayName: "Pastillas Bosch", stock: 0 }), stockLow: true },
      { ...part(2, { displayName: "Discos Fremax", stock: 3 }), stockLow: true },
      { ...part(3, { displayName: "Filtro de aire", stock: 40, categoria: "Filtros" }), stockLow: false },
    ],
  });
  getStockoutRisk.mockImplementation(({ onlyInRisk }) =>
    Promise.resolve(
      onlyInRisk
        ? alertas
        : {
            ...alertas,
            repuestos: [
              ...alertas.repuestos,
              { ...part(3, { displayName: "Filtro de aire", stock: 40 }), projectedDemand: 0, dailyDemand: 0, coverageDays: null, risk: "low" },
            ],
          }
    )
  );
  getSalesTrend.mockResolvedValue(trend);
  // La sección de pedidos tiene sus propios tests (PedidosVendedor.test.jsx).
  getOrders.mockResolvedValue({ orders: [], total: 0, byStatus: {}, forPrepare: 3 });
  getBestSellers.mockResolvedValue([
    { ...part(2, { displayName: "Discos Fremax" }), unitsSold: 120 },
    { ...part(1, { displayName: "Pastillas Bosch" }), unitsSold: 80 },
  ]);
  getDemandForecast.mockResolvedValue({
    month: "2026-11",
    repuestos: [{ ...part(1, { displayName: "Pastillas Bosch" }), unitsLastYear: 400, projectedDemand: 60 }],
  });
});

afterEach(() => {
  restoreChart();
  jest.clearAllMocks();
});

function FakeDetail() {
  return <p>Detalle del repuesto {useParams().id}</p>;
}

function FakeOrder() {
  return <p>Detalle del pedido {useParams().id}</p>;
}

function renderDashboard(route = "/dashboard", sessionUser = { email: "vendedor@example.com" }) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard sessionUser={sessionUser} />} />
        <Route path="/dashboard/repuestos/:id" element={<FakeDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

const lastCall = (mock) => mock.mock.calls.at(-1)[0];

// El número de un indicador del resumen (va debajo del título y su ícono).
const valueOf = (title) => screen.getByText(title, { selector: "p" }).parentElement.nextSibling;
const menu = () => screen.getByRole("navigation", { name: "Secciones del dashboard" });

describe("acceso y datos del sistema (HU 5.1)", () => {
  it("opens on Resumen with the sales of the last closed month against the previous one", async () => {
    renderDashboard();

    expect(screen.getByRole("heading", { level: 1, name: "Resumen" })).toBeInTheDocument();
    // Sin nombre en la sesión, usa la parte del correo antes de la @.
    expect(screen.getByText(/Hola, vendedor\./)).toBeInTheDocument();
    // Octubre está en curso: se compara setiembre (20) con agosto (19).
    const units = await screen.findByText("Unidades vendidas en setiembre");
    expect(units.parentElement.nextSibling).toHaveTextContent("20");
    expect(units.closest(".rounded-xl")).toHaveTextContent("+5 % vs. agosto");
    expect(valueOf("Facturación de setiembre")).toHaveTextContent("$ 20.000");
  });

  it("greets the seller by the first name that comes in the session token", async () => {
    const json = JSON.stringify({ sub: "9", user_type: "employee", name: "Martín Silva" });
    const token = `x.${btoa(String.fromCharCode(...new TextEncoder().encode(json)))}.y`;
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard sessionUser={{ email: "msilva@example.com", token }} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/^Hola, Martín\./)).toBeInTheDocument();
    expect(screen.getByText("Martín Silva")).toBeInTheDocument();
    expect(screen.queryByText(/msilva@example\.com/)).not.toBeInTheDocument();
    await screen.findByRole("figure", { name: /Evolución de ventas/ });
  });

  it("shows how many parts need restocking and how many are out of stock", async () => {
    renderDashboard();

    await waitFor(() => expect(valueOf("Para reponer")).toHaveTextContent("2"));
    expect(screen.getByText("Para reponer", { selector: "p" }).closest("button")).toHaveTextContent("1 con riesgo alto");
    await waitFor(() => expect(valueOf("Sin stock")).toHaveTextContent("1"));
    expect(screen.getByText("Sin stock", { selector: "p" }).closest("button")).toHaveTextContent("33,3 % del catálogo");
  });

  it("shows next to Reposición in the menu the same count as Para reponer", async () => {
    renderDashboard();

    expect(await within(menu()).findByRole("button", { name: /^Reposición\s*:\s*2$/ })).toBeInTheDocument();
  });

  it("lists on Resumen the paid orders waiting to be prepared, and opens one's detail", async () => {
    const user = userEvent.setup();
    getOrders.mockResolvedValue({
      orders: [
        {
          id: 77,
          date: "2026-11-05T14:30:00Z",
          total: 3000,
          customer: { displayName: "Ana Pérez", email: "ana@example.com" },
          items: [{ displayName: "Pastillas Bosch", quantity: 2 }],
        },
      ],
      total: 4,
      byStatus: { confirmed: 4 },
      forPrepare: 4,
    });
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard sessionUser={{ email: "vendedor@example.com" }} />} />
          <Route path="/dashboard/pedidos/:id" element={<FakeOrder />} />
        </Routes>
      </MemoryRouter>
    );

    const list = await screen.findByRole("list", { name: "Pedidos para preparar" });
    expect(list).toHaveTextContent("#77 · Ana Pérez");
    expect(list).toHaveTextContent("Pastillas Bosch · 2 u.");
    expect(screen.getByText("Y 3 más esperando.")).toBeInTheDocument();
    expect(getOrders).toHaveBeenCalledWith({ estado: "confirmed", onlyPaid: true, limit: 5 });

    await user.click(within(list).getByRole("button", { name: "Ver el detalle del pedido #77 de Ana Pérez" }));
    expect(screen.getByText("Detalle del pedido 77")).toBeInTheDocument();
  });

  it("shows next to Pedidos in the menu how many paid orders are waiting to be prepared", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const orders = await within(menu()).findByRole("button", { name: /^Pedidos\s*:\s*3$/ });
    await user.click(orders);

    expect(screen.getByRole("heading", { level: 1, name: "Pedidos" })).toBeInTheDocument();
    // Los pedidos se filtran por estado, no por categoría ni búsqueda.
    expect(screen.queryByRole("button", { name: "Últimos 3 meses" })).not.toBeInTheDocument();
    expect(await screen.findByText("Todavía no hay pedidos.")).toBeInTheDocument();
  });
});

describe("evolución de ventas (HU 5.4) y proyección (HU 5.5)", () => {
  it("draws a line chart with the units of each of the last 12 months", async () => {
    const { container } = renderDashboard();

    const chart = await screen.findByRole("figure", { name: "Evolución de ventas de los últimos 12 meses" });
    await waitFor(() => expect(container.querySelectorAll(".recharts-line").length).toBeGreaterThan(0));
    expect(container.querySelector(".recharts-surface")).toHaveAttribute("width", "800");

    const rows = within(chart).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(13); // 12 meses + la proyección
    expect(rows[0]).toHaveTextContent("noviembre de 2025");
    expect(rows[11]).toHaveTextContent("octubre de 2026 (en curso)");
    expect(lastCall(getSalesTrend)).toEqual(expect.objectContaining({ months: 12 }));
  });

  it("shows the increase between a month and the previous one", async () => {
    getSalesTrend.mockResolvedValue({
      ...trend,
      months: trend.months.map((month, i) => ({ ...month, units: i === 11 ? 25 : 10 })),
    });
    renderDashboard();

    const chart = await screen.findByRole("figure", { name: /Evolución de ventas/ });
    const octubre = within(chart).getByRole("row", { name: /octubre de 2026/ });
    expect(octubre).toHaveTextContent("+15 (+150 %) vs. el mes anterior");
  });

  it("shows the real sales and the projected demand together", async () => {
    renderDashboard("/dashboard?vista=sales");

    expect(await screen.findByText("Proyección de noviembre de 2026")).toBeInTheDocument();
    expect(screen.getByText(/Demanda proyectada para noviembre de 2026/)).toHaveTextContent("40 unidades");
    const chart = screen.getByRole("figure", { name: /Evolución de ventas/ });
    expect(within(chart).getByRole("row", { name: /noviembre de 2026 \(proyección\)/ })).toHaveTextContent("40");
  });

  it("shows the total, the best month and the expected units above the chart", async () => {
    renderDashboard();

    const total = await screen.findByText("Total del período");
    expect(total.nextSibling).toHaveTextContent("186"); // 10 + 11 + ... + 21
    expect(screen.getByText("Mejor mes").nextSibling).toHaveTextContent("21");
    expect(screen.getByText("Mejor mes").parentElement).toHaveTextContent("octubre de 2026");
    expect(screen.getByText("Se espera el mes que viene").nextSibling).toHaveTextContent("40");
  });

  it("switches the chart to revenue, without the projection", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText("Proyección de noviembre de 2026");

    await user.click(screen.getByRole("button", { name: "Facturación" }));

    const chart = screen.getByRole("figure", { name: /Evolución de ventas/ });
    expect(within(chart).getByRole("row", { name: /octubre de 2026/ })).toHaveTextContent("$ 21.000");
    expect(screen.queryByText("Proyección de noviembre de 2026")).not.toBeInTheDocument();
  });
});

describe("filtros (HU 5.9)", () => {
  it("filters every view by category", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole("figure", { name: /Evolución de ventas/ });

    await user.click(screen.getByRole("combobox", { name: "Categoría" }));
    await user.click(await screen.findByRole("option", { name: "Frenos" }));

    await waitFor(() => expect(lastCall(getSalesTrend)).toEqual(expect.objectContaining({ categoria: "Frenos" })));
    expect(lastCall(getStock)).toEqual(expect.objectContaining({ categoria: "Frenos" }));
    expect(lastCall(getStockoutRisk)).toEqual(expect.objectContaining({ categoria: "Frenos", onlyInRisk: true }));
  });

  it("filters the sales by the last 3 months", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole("figure", { name: /Evolución de ventas/ });

    await user.click(screen.getByRole("button", { name: "Últimos 3 meses" }));

    await waitFor(() => expect(lastCall(getSalesTrend)).toEqual(expect.objectContaining({ months: 3 })));
    expect(screen.getByRole("heading", { name: "Ventas · últimos 3 meses" })).toBeInTheDocument();
  });

  it("searches a part by name or code when the search is applied", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole("figure", { name: /Evolución de ventas/ });

    await user.type(screen.getByLabelText("Repuesto"), "FRE-001");
    expect(lastCall(getSalesTrend)).toEqual(expect.objectContaining({ search: "" }));
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => expect(lastCall(getSalesTrend)).toEqual(expect.objectContaining({ search: "FRE-001" })));
    expect(lastCall(getStock)).toEqual(expect.objectContaining({ search: "FRE-001" }));
  });

  it("removes every filter with Quitar filtros", async () => {
    const user = userEvent.setup();
    renderDashboard("/dashboard?categoria=Frenos&q=disco&periodo=3");
    await screen.findByRole("figure", { name: /Evolución de ventas/ });
    expect(lastCall(getSalesTrend)).toEqual({ categoria: "Frenos", search: "disco", months: 3 });
    expect(screen.getByLabelText("Repuesto")).toHaveValue("disco");

    await user.click(screen.getByRole("button", { name: "Quitar filtros" }));

    await waitFor(() => expect(lastCall(getSalesTrend)).toEqual({ categoria: "", search: "", months: 12 }));
    expect(screen.getByLabelText("Repuesto")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Quitar filtros" })).not.toBeInTheDocument();
  });
});

describe("alertas de reposición (HU 5.7)", () => {
  it("shows one alert per part at risk, with its stock and projected demand", async () => {
    renderDashboard();

    const list = await screen.findByRole("list", { name: "Repuestos para reponer" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Pastillas Bosch");
    expect(within(items[0]).getByText("Stock").nextSibling).toHaveTextContent("10");
    expect(within(items[0]).getByText("Demanda").nextSibling).toHaveTextContent("60 / mes");
    expect(within(items[0]).getByText("Alcanza para").nextSibling).toHaveTextContent("5 días");
  });

  it("says so when no part needs restocking", async () => {
    getStockoutRisk.mockResolvedValue({ ...alertas, repuestos: [] });
    renderDashboard();

    expect(await screen.findByText("No hay repuestos que requieran reposición")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Repuestos para reponer" })).not.toBeInTheDocument();
  });

  it("puts the high risk alert first and highlights it", async () => {
    renderDashboard();

    const items = within(await screen.findByRole("list", { name: "Repuestos para reponer" })).getAllByRole("listitem");
    expect(items.map((item) => item.dataset.risk)).toEqual(["high", "medium"]);
    expect(items[0]).toHaveTextContent("Riesgo alto");
    expect(items[0].querySelector(".bg-red-500")).toBeInTheDocument();
    expect(items[1]).toHaveTextContent("Riesgo medio");
    expect(items[1].querySelector(".bg-red-500")).not.toBeInTheDocument();
  });

  it("opens the part detail from an alert", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const list = await screen.findByRole("list", { name: "Repuestos para reponer" });
    await user.click(within(list).getByRole("button", { name: "Pastillas Bosch" }));

    expect(screen.getByText("Detalle del repuesto 1")).toBeInTheDocument();
  });

  it("restocks a part from its alert and reloads the data", async () => {
    const user = userEvent.setup();
    adjustStock.mockResolvedValue({ ...part(1, { displayName: "Pastillas Bosch", stock: 50 }) });
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Reponer Pastillas Bosch (FRE-001)" }));
    const dialogo = await screen.findByRole("dialog", { name: "Ajustar stock" });
    const field = within(dialogo).getByLabelText("Unidades disponibles");
    await user.clear(field);
    await user.type(field, "50");
    const ordersBefore = getStockoutRisk.mock.calls.length;
    await user.click(within(dialogo).getByRole("button", { name: "Guardar stock" }));

    expect(adjustStock).toHaveBeenCalledWith(1, "50");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(getStockoutRisk.mock.calls.length).toBeGreaterThan(ordersBefore);
  });
});

describe("secciones del menú", () => {
  const open = async (displayName) => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(within(menu()).getByRole("button", { name: displayName }));
    return user;
  };

  it("starts on Resumen and marks the open section in the menu", async () => {
    const user = userEvent.setup();
    renderDashboard();
    expect(within(menu()).getByRole("button", { name: "Resumen" })).toHaveAttribute("aria-current", "page");

    await user.click(within(menu()).getByRole("button", { name: "Stock" }));

    expect(within(menu()).getByRole("button", { name: "Stock" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 1, name: "Stock" })).toBeInTheDocument();
    // El stock muestra el presente: no tiene filtro de período.
    expect(screen.queryByRole("button", { name: "Últimos 3 meses" })).not.toBeInTheDocument();
  });

  it("opens the stock table filtered by the parts out of stock from its card", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await waitFor(() => expect(valueOf("Sin stock")).toHaveTextContent("1"));

    await user.click(screen.getByText("Sin stock").closest("button"));

    expect(await screen.findByRole("heading", { level: 1, name: "Stock" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Sin stock \(/ })).toHaveAttribute("aria-pressed", "true");
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Pastillas Bosch");
  });

  it("opens every alert from Ver todas", async () => {
    getStockoutRisk.mockImplementation(() =>
      Promise.resolve({
        ...alertas,
        repuestos: [1, 2, 3, 4, 5, 6].map((id) => ({ ...alertas.repuestos[0], id, code: `FRE-00${id}` })),
      })
    );
    const user = userEvent.setup();
    renderDashboard();

    const list = await screen.findByRole("list", { name: "Repuestos para reponer" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: /Ver todas/ }));

    expect(await screen.findByRole("heading", { level: 1, name: "Reposición" })).toBeInTheDocument();
  });

  it("lists the current stock with name, quantity and a written low stock state (HU 5.2)", async () => {
    const user = await open("Stock");

    await screen.findByText("Repuestos", { selector: "dt" });
    const dato = (title) => screen.getByText(title, { selector: "dt" }).nextSibling;
    expect(dato("Repuestos")).toHaveTextContent("3");
    expect(dato("Unidades en stock")).toHaveTextContent("43");
    expect(dato("Con stock bajo")).toHaveTextContent("1");
    expect(dato("Sin stock")).toHaveTextContent("1");

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").map((c) => c.textContent))).toEqual([
      ["FRE-001", "Pastillas Bosch", "Bosch", "Frenos", "0", "Sin stock", "Ajustar"],
      ["FRE-002", "Discos Fremax", "Bosch", "Frenos", "3", "Stock bajo", "Ajustar"],
      ["FRE-003", "Filtro de aire", "Bosch", "Filtros", "40", "Normal", "Ajustar"],
    ]);

    await user.click(screen.getByRole("button", { name: "Sin stock (1)" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
  });

  it("ranks the best sellers by units sold (HU 5.3)", async () => {
    await open("Más vendidos");

    const items = within(await screen.findByRole("list", { name: "Repuestos más vendidos" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^1Discos Fremax.*120 u\.$/),
      expect.stringMatching(/^2Pastillas Bosch.*80 u\.$/),
    ]);
    expect(lastCall(getBestSellers)).toEqual(expect.objectContaining({ months: 12 }));
  });

  it("lists the projected demand per part (HU 5.5)", async () => {
    await open("Proyección de demanda");

    const row = within(await screen.findByRole("table")).getAllByRole("row")[1];
    expect(row).toHaveTextContent("Pastillas Bosch");
    expect(within(row).getAllByRole("cell")[2]).toHaveTextContent("60");
  });

  it("lists the parts from the most to the least urgent risk (HU 5.6)", async () => {
    const user = await open(/^Reposición/);
    // Abre con lo mismo que cuenta el resumen: riesgo alto y medio.
    expect(await screen.findByRole("button", { name: "Para reponer (2)" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Todos (3)" }));

    const rows = within(await screen.findByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[1].textContent)).toEqual([
      "Riesgo alto",
      "Riesgo medio",
      "Riesgo bajo",
    ]);
    expect(rows[2]).toHaveTextContent("Sin demanda proyectada");
  });
});

it("shows the error and retries", async () => {
  const user = userEvent.setup();
  getSalesTrend.mockRejectedValueOnce(new Error("No pudimos cargar la evolución de ventas."));
  renderDashboard();

  expect(await screen.findByText("No pudimos cargar la evolución de ventas.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(await screen.findByRole("figure", { name: /Evolución de ventas/ })).toBeInTheDocument();
});

describe("sección Equipo (SCRUM-175)", () => {
  // Un JWT de mentira: el portal solo lee el payload.
  const sessionOf = (payload) => ({
    email: "vendedor@example.com",
    userType: "employee",
    token: `x.${btoa(JSON.stringify({ sub: "1", user_type: "employee", ...payload }))}.y`,
  });

  test("an admin sees Equipo in the menu and is told they're an admin", async () => {
    renderDashboard("/dashboard", sessionOf({ admin: true }));

    expect(within(menu()).getByRole("button", { name: "Equipo" })).toBeInTheDocument();
    expect(screen.getAllByText("Administrador").length).toBeGreaterThan(0);
  });

  test("a regular seller doesn't see Equipo and ?vista=team leads to the summary", async () => {
    renderDashboard("/dashboard?vista=team", sessionOf({}));

    expect(within(menu()).queryByRole("button", { name: "Equipo" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "Resumen" })).toBeInTheDocument();
  });
});

