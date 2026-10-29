import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";

jest.mock("./apiDashboard");
jest.mock("../api", () => ({ obtenerCategorias: jest.fn() }));
// El Navbar tiene sus propios tests (vendedor.test.jsx) y necesita el carrito.
jest.mock("../Navbar", () => function NavbarFalso() {
  return <nav />;
});

import Dashboard from "./Dashboard";
import { obtenerCategorias } from "../api";
import {
  obtenerEvolucionVentas,
  obtenerMasVendidos,
  obtenerProyeccionDemanda,
  obtenerRiesgoAgotamiento,
  obtenerStock,
} from "./apiDashboard";
import { simularTamanioDelGrafico } from "./testGrafico";

const repuesto = (id, extra = {}) => ({
  id,
  codigo: `FRE-00${id}`,
  nombre: `Repuesto ${id}`,
  fabricante: "Bosch",
  categoria: "Frenos",
  stock: 10,
  ...extra,
});

const MESES = [
  "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04",
  "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
];

const evolucion = {
  meses: MESES.map((mes, i) => ({ mes, unidades: 10 + i, facturacion: (10 + i) * 1000, enCurso: i === 11 })),
  proyeccion: { mes: "2026-11", unidades: 40 },
};

const alertas = {
  mes: "2026-11",
  umbrales: { alto: 15, medio: 30 },
  repuestos: [
    { ...repuesto(1, { nombre: "Pastillas Bosch", stock: 10 }), demandaProyectada: 60, demandaDiaria: 2, diasCobertura: 5, riesgo: "high" },
    { ...repuesto(2, { nombre: "Discos Fremax", stock: 20 }), demandaProyectada: 30, demandaDiaria: 1, diasCobertura: 20, riesgo: "medium" },
  ],
};

let restaurarGrafico;

beforeEach(() => {
  restaurarGrafico = simularTamanioDelGrafico();
  obtenerCategorias.mockResolvedValue([
    { nombre: "Filtros", cantidad: 2 },
    { nombre: "Frenos", cantidad: 3 },
  ]);
  obtenerStock.mockResolvedValue({
    umbralStockBajo: 5,
    repuestos: [
      { ...repuesto(1, { nombre: "Pastillas Bosch", stock: 0 }), stockBajo: true },
      { ...repuesto(2, { nombre: "Discos Fremax", stock: 3 }), stockBajo: true },
      { ...repuesto(3, { nombre: "Filtro de aire", stock: 40, categoria: "Filtros" }), stockBajo: false },
    ],
  });
  obtenerRiesgoAgotamiento.mockImplementation(({ soloEnRiesgo }) =>
    Promise.resolve(
      soloEnRiesgo
        ? alertas
        : {
            ...alertas,
            repuestos: [
              ...alertas.repuestos,
              { ...repuesto(3, { nombre: "Filtro de aire", stock: 40 }), demandaProyectada: 0, demandaDiaria: 0, diasCobertura: null, riesgo: "low" },
            ],
          }
    )
  );
  obtenerEvolucionVentas.mockResolvedValue(evolucion);
  obtenerMasVendidos.mockResolvedValue([
    { ...repuesto(2, { nombre: "Discos Fremax" }), unidadesVendidas: 120 },
    { ...repuesto(1, { nombre: "Pastillas Bosch" }), unidadesVendidas: 80 },
  ]);
  obtenerProyeccionDemanda.mockResolvedValue({
    mes: "2026-11",
    repuestos: [{ ...repuesto(1, { nombre: "Pastillas Bosch" }), unidadesUltimoAnio: 400, demandaProyectada: 60 }],
  });
});

afterEach(() => {
  restaurarGrafico();
  jest.clearAllMocks();
});

function DetalleFalso() {
  return <p>Detalle del repuesto {useParams().id}</p>;
}

function renderDashboard(ruta = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard usuario={{ email: "vendedor@example.com" }} />} />
        <Route path="/dashboard/repuestos/:id" element={<DetalleFalso />} />
      </Routes>
    </MemoryRouter>
  );
}

const ultimaLlamada = (mock) => mock.mock.calls.at(-1)[0];

describe("acceso y datos del sistema (HU 5.1)", () => {
  it("shows the dashboard with the stock figures that come from the API", async () => {
    renderDashboard();

    expect(screen.getByRole("heading", { name: "Dashboard del vendedor" })).toBeInTheDocument();
    expect(screen.getByText(/vendedor@example\.com/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Repuestos").nextSibling).toHaveTextContent("3"));
    expect(screen.getByText("Unidades en stock").nextSibling).toHaveTextContent("43");
    expect(screen.getByText("Con stock bajo").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("Sin stock").nextSibling).toHaveTextContent("1");
  });
});

describe("evolución de ventas (HU 5.4) y proyección (HU 5.5)", () => {
  it("draws a line chart with the units of each of the last 12 months", async () => {
    const { container } = renderDashboard();

    const grafico = await screen.findByRole("figure", { name: "Evolución de ventas de los últimos 12 meses" });
    await waitFor(() => expect(container.querySelectorAll(".recharts-line").length).toBeGreaterThan(0));
    expect(container.querySelector(".recharts-surface")).toHaveAttribute("width", "800");

    const filas = within(grafico).getAllByRole("row").slice(1);
    expect(filas).toHaveLength(13); // 12 meses + la proyección
    expect(filas[0]).toHaveTextContent("noviembre de 2025");
    expect(filas[11]).toHaveTextContent("octubre de 2026 (en curso)");
    expect(ultimaLlamada(obtenerEvolucionVentas)).toEqual(expect.objectContaining({ meses: 12 }));
  });

  it("shows the increase between a month and the previous one", async () => {
    obtenerEvolucionVentas.mockResolvedValue({
      ...evolucion,
      meses: evolucion.meses.map((mes, i) => ({ ...mes, unidades: i === 11 ? 25 : 10 })),
    });
    renderDashboard();

    const grafico = await screen.findByRole("figure", { name: /Evolución de ventas/ });
    const octubre = within(grafico).getByRole("row", { name: /octubre de 2026/ });
    expect(octubre).toHaveTextContent("+15 (+150 %) vs. el mes anterior");
  });

  it("shows the real sales and the projected demand together", async () => {
    renderDashboard();

    expect(await screen.findByText("Proyección de noviembre de 2026")).toBeInTheDocument();
    expect(screen.getByText(/Demanda proyectada para noviembre de 2026/)).toHaveTextContent("40 unidades");
    const grafico = screen.getByRole("figure", { name: /Evolución de ventas/ });
    expect(within(grafico).getByRole("row", { name: /noviembre de 2026 \(proyección\)/ })).toHaveTextContent("40");
  });

  it("switches the chart to revenue, without the projection", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText("Proyección de noviembre de 2026");

    await user.click(screen.getByRole("button", { name: "Facturación" }));

    const grafico = screen.getByRole("figure", { name: /Evolución de ventas/ });
    expect(within(grafico).getByRole("row", { name: /octubre de 2026/ })).toHaveTextContent("$ 21.000");
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

    await waitFor(() => expect(ultimaLlamada(obtenerEvolucionVentas)).toEqual(expect.objectContaining({ categoria: "Frenos" })));
    expect(ultimaLlamada(obtenerStock)).toEqual(expect.objectContaining({ categoria: "Frenos" }));
    expect(ultimaLlamada(obtenerRiesgoAgotamiento)).toEqual(expect.objectContaining({ categoria: "Frenos", soloEnRiesgo: true }));
  });

  it("filters the sales by the last 3 months", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole("figure", { name: /Evolución de ventas/ });

    await user.click(screen.getByRole("button", { name: "Últimos 3 meses" }));

    await waitFor(() => expect(ultimaLlamada(obtenerEvolucionVentas)).toEqual(expect.objectContaining({ meses: 3 })));
    expect(screen.getByRole("heading", { name: "Evolución de ventas · últimos 3 meses" })).toBeInTheDocument();
  });

  it("searches a part by name or code when the search is applied", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole("figure", { name: /Evolución de ventas/ });

    await user.type(screen.getByLabelText("REPUESTO"), "FRE-001");
    expect(ultimaLlamada(obtenerEvolucionVentas)).toEqual(expect.objectContaining({ busqueda: "" }));
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => expect(ultimaLlamada(obtenerEvolucionVentas)).toEqual(expect.objectContaining({ busqueda: "FRE-001" })));
    expect(ultimaLlamada(obtenerStock)).toEqual(expect.objectContaining({ busqueda: "FRE-001" }));
  });

  it("removes every filter with Quitar filtros", async () => {
    const user = userEvent.setup();
    renderDashboard("/dashboard?categoria=Frenos&q=disco&periodo=3");
    await screen.findByRole("figure", { name: /Evolución de ventas/ });
    expect(ultimaLlamada(obtenerEvolucionVentas)).toEqual({ categoria: "Frenos", busqueda: "disco", meses: 3 });
    expect(screen.getByLabelText("REPUESTO")).toHaveValue("disco");

    await user.click(screen.getByRole("button", { name: "Quitar filtros" }));

    await waitFor(() => expect(ultimaLlamada(obtenerEvolucionVentas)).toEqual({ categoria: "", busqueda: "", meses: 12 }));
    expect(screen.getByLabelText("REPUESTO")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Quitar filtros" })).toBeDisabled();
  });
});

describe("alertas de reposición (HU 5.7)", () => {
  it("shows one alert per part at risk, with its stock and projected demand", async () => {
    renderDashboard();

    const lista = await screen.findByRole("list", { name: "Repuestos para reponer" });
    const items = within(lista).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Pastillas Bosch");
    expect(within(items[0]).getByText("Stock actual").nextSibling).toHaveTextContent("10");
    expect(within(items[0]).getByText("Demanda proyectada").nextSibling).toHaveTextContent("60 / mes");
    expect(within(items[0]).getByText("Cobertura").nextSibling).toHaveTextContent("5 días");
  });

  it("says so when no part needs restocking", async () => {
    obtenerRiesgoAgotamiento.mockResolvedValue({ ...alertas, repuestos: [] });
    renderDashboard();

    expect(await screen.findByText("No hay repuestos que requieran reposición")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Repuestos para reponer" })).not.toBeInTheDocument();
  });

  it("puts the high risk alert first and highlights it", async () => {
    renderDashboard();

    const items = within(await screen.findByRole("list", { name: "Repuestos para reponer" })).getAllByRole("listitem");
    expect(items.map((item) => item.dataset.riesgo)).toEqual(["high", "medium"]);
    expect(items[0]).toHaveTextContent("Riesgo alto");
    const tarjeta = (item) => item.querySelector("[data-slot=card]");
    expect(tarjeta(items[0]).className).toMatch(/border-l-red-600/);
    expect(items[1]).toHaveTextContent("Riesgo medio");
    expect(tarjeta(items[1]).className).not.toMatch(/red/);
  });

  it("opens the part detail from an alert", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Ver detalle de Pastillas Bosch (FRE-001)" }));

    expect(screen.getByText("Detalle del repuesto 1")).toBeInTheDocument();
  });
});

describe("pestañas", () => {
  const abrir = async (nombre) => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole("tab", { name: nombre }));
    return user;
  };

  it("lists the current stock with name, quantity and a written low stock state (HU 5.2)", async () => {
    const user = await abrir("Stock actual");

    const tabla = await screen.findByRole("table");
    const filas = within(tabla).getAllByRole("row").slice(1);
    expect(filas.map((fila) => within(fila).getAllByRole("cell").map((c) => c.textContent))).toEqual([
      ["FRE-001", "Pastillas Bosch", "Bosch", "Frenos", "0", "Sin stock"],
      ["FRE-002", "Discos Fremax", "Bosch", "Frenos", "3", "Stock bajo"],
      ["FRE-003", "Filtro de aire", "Bosch", "Filtros", "40", "Normal"],
    ]);

    await user.click(screen.getByRole("button", { name: "Solo sin stock" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
  });

  it("ranks the best sellers by units sold (HU 5.3)", async () => {
    await abrir("Más vendidos");

    const items = within(await screen.findByRole("list", { name: "Repuestos más vendidos" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^1Discos Fremax.*120 u\.$/),
      expect.stringMatching(/^2Pastillas Bosch.*80 u\.$/),
    ]);
    expect(ultimaLlamada(obtenerMasVendidos)).toEqual(expect.objectContaining({ meses: 12 }));
  });

  it("lists the projected demand per part (HU 5.5)", async () => {
    await abrir("Proyección");

    const fila = within(await screen.findByRole("table")).getAllByRole("row")[1];
    expect(fila).toHaveTextContent("Pastillas Bosch");
    expect(within(fila).getAllByRole("cell")[2]).toHaveTextContent("60");
  });

  it("lists the parts from the most to the least urgent risk (HU 5.6)", async () => {
    await abrir("Riesgo de agotamiento");

    const filas = within(await screen.findByRole("table")).getAllByRole("row").slice(1);
    expect(filas.map((fila) => within(fila).getAllByRole("cell")[1].textContent)).toEqual([
      "Riesgo alto",
      "Riesgo medio",
      "Riesgo bajo",
    ]);
    expect(filas[2]).toHaveTextContent("Sin demanda proyectada");
  });
});

it("shows the error and retries", async () => {
  const user = userEvent.setup();
  obtenerEvolucionVentas.mockRejectedValueOnce(new Error("No pudimos cargar la evolución de ventas."));
  renderDashboard();

  expect(await screen.findByText("No pudimos cargar la evolución de ventas.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(await screen.findByRole("figure", { name: /Evolución de ventas/ })).toBeInTheDocument();
});
