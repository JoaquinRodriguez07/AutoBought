import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";

jest.mock("./apiDashboard");
jest.mock("../api", () => ({ obtenerCategorias: jest.fn() }));

import Dashboard from "./Dashboard";
import { obtenerCategorias } from "../api";
import {
  ajustarStock,
  funcionSinPublicar,
  obtenerEvolucionVentas,
  obtenerMasVendidos,
  obtenerProyeccionDemanda,
  obtenerResumenIA,
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
  // El resumen con IA (HU 6.3) tiene sus propios tests (IA.test.jsx): acá
  // el backend todavía no lo tiene.
  funcionSinPublicar.mockImplementation(jest.requireActual("./apiDashboard").funcionSinPublicar);
  obtenerResumenIA.mockRejectedValue(Object.assign(new Error("No encontrado"), { status: 404 }));
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

// El número de un indicador del resumen (va debajo del título y su ícono).
const valorDe = (titulo) => screen.getByText(titulo, { selector: "p" }).parentElement.nextSibling;
const menu = () => screen.getByRole("navigation", { name: "Secciones del dashboard" });

describe("acceso y datos del sistema (HU 5.1)", () => {
  it("opens on Resumen with the sales of the last closed month against the previous one", async () => {
    renderDashboard();

    expect(screen.getByRole("heading", { level: 1, name: "Resumen" })).toBeInTheDocument();
    // Sin nombre en la sesión, usa la parte del correo antes de la @.
    expect(screen.getByText(/Hola, vendedor\./)).toBeInTheDocument();
    // Octubre está en curso: se compara setiembre (20) con agosto (19).
    const unidades = await screen.findByText("Unidades vendidas en setiembre");
    expect(unidades.parentElement.nextSibling).toHaveTextContent("20");
    expect(unidades.closest(".rounded-xl")).toHaveTextContent("+5 % vs. agosto");
    expect(valorDe("Facturación de setiembre")).toHaveTextContent("$ 20.000");
  });

  it("greets the seller by the first name that comes in the session token", async () => {
    const json = JSON.stringify({ sub: "9", user_type: "employee", name: "Martín Silva" });
    const token = `x.${btoa(String.fromCharCode(...new TextEncoder().encode(json)))}.y`;
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard usuario={{ email: "msilva@example.com", token }} />} />
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

    await waitFor(() => expect(valorDe("Para reponer")).toHaveTextContent("2"));
    expect(screen.getByText("Para reponer", { selector: "p" }).closest("button")).toHaveTextContent("1 con riesgo alto");
    await waitFor(() => expect(valorDe("Sin stock")).toHaveTextContent("1"));
    expect(screen.getByText("Sin stock", { selector: "p" }).closest("button")).toHaveTextContent("33,3 % del catálogo");
  });

  it("shows next to Reposición in the menu the same count as Para reponer", async () => {
    renderDashboard();

    expect(await within(menu()).findByRole("button", { name: /^Reposición\s*:\s*2$/ })).toBeInTheDocument();
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
    renderDashboard("/dashboard?vista=ventas");

    expect(await screen.findByText("Proyección de noviembre de 2026")).toBeInTheDocument();
    expect(screen.getByText(/Demanda proyectada para noviembre de 2026/)).toHaveTextContent("40 unidades");
    const grafico = screen.getByRole("figure", { name: /Evolución de ventas/ });
    expect(within(grafico).getByRole("row", { name: /noviembre de 2026 \(proyección\)/ })).toHaveTextContent("40");
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
    expect(screen.getByRole("heading", { name: "Ventas · últimos 3 meses" })).toBeInTheDocument();
  });

  it("searches a part by name or code when the search is applied", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole("figure", { name: /Evolución de ventas/ });

    await user.type(screen.getByLabelText("Repuesto"), "FRE-001");
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
    expect(screen.getByLabelText("Repuesto")).toHaveValue("disco");

    await user.click(screen.getByRole("button", { name: "Quitar filtros" }));

    await waitFor(() => expect(ultimaLlamada(obtenerEvolucionVentas)).toEqual({ categoria: "", busqueda: "", meses: 12 }));
    expect(screen.getByLabelText("Repuesto")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Quitar filtros" })).not.toBeInTheDocument();
  });
});

describe("alertas de reposición (HU 5.7)", () => {
  it("shows one alert per part at risk, with its stock and projected demand", async () => {
    renderDashboard();

    const lista = await screen.findByRole("list", { name: "Repuestos para reponer" });
    const items = within(lista).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Pastillas Bosch");
    expect(within(items[0]).getByText("Stock").nextSibling).toHaveTextContent("10");
    expect(within(items[0]).getByText("Demanda").nextSibling).toHaveTextContent("60 / mes");
    expect(within(items[0]).getByText("Alcanza para").nextSibling).toHaveTextContent("5 días");
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
    expect(items[0].querySelector(".bg-red-500")).toBeInTheDocument();
    expect(items[1]).toHaveTextContent("Riesgo medio");
    expect(items[1].querySelector(".bg-red-500")).not.toBeInTheDocument();
  });

  it("opens the part detail from an alert", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const lista = await screen.findByRole("list", { name: "Repuestos para reponer" });
    await user.click(within(lista).getByRole("button", { name: "Pastillas Bosch" }));

    expect(screen.getByText("Detalle del repuesto 1")).toBeInTheDocument();
  });

  it("restocks a part from its alert and reloads the data", async () => {
    const user = userEvent.setup();
    ajustarStock.mockResolvedValue({ ...repuesto(1, { nombre: "Pastillas Bosch", stock: 50 }) });
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Reponer Pastillas Bosch (FRE-001)" }));
    const dialogo = await screen.findByRole("dialog", { name: "Ajustar stock" });
    const campo = within(dialogo).getByLabelText("Unidades disponibles");
    await user.clear(campo);
    await user.type(campo, "50");
    const pedidosAntes = obtenerRiesgoAgotamiento.mock.calls.length;
    await user.click(within(dialogo).getByRole("button", { name: "Guardar stock" }));

    expect(ajustarStock).toHaveBeenCalledWith(1, "50");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(obtenerRiesgoAgotamiento.mock.calls.length).toBeGreaterThan(pedidosAntes);
  });
});

describe("secciones del menú", () => {
  const abrir = async (nombre) => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(within(menu()).getByRole("button", { name: nombre }));
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
    await waitFor(() => expect(valorDe("Sin stock")).toHaveTextContent("1"));

    await user.click(screen.getByText("Sin stock").closest("button"));

    expect(await screen.findByRole("heading", { level: 1, name: "Stock" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Sin stock \(/ })).toHaveAttribute("aria-pressed", "true");
    const filas = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toHaveTextContent("Pastillas Bosch");
  });

  it("opens every alert from Ver todas", async () => {
    obtenerRiesgoAgotamiento.mockImplementation(() =>
      Promise.resolve({
        ...alertas,
        repuestos: [1, 2, 3, 4, 5, 6].map((id) => ({ ...alertas.repuestos[0], id, codigo: `FRE-00${id}` })),
      })
    );
    const user = userEvent.setup();
    renderDashboard();

    const lista = await screen.findByRole("list", { name: "Repuestos para reponer" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: /Ver todas/ }));

    expect(await screen.findByRole("heading", { level: 1, name: "Reposición" })).toBeInTheDocument();
  });

  it("lists the current stock with name, quantity and a written low stock state (HU 5.2)", async () => {
    const user = await abrir("Stock");

    await screen.findByText("Repuestos", { selector: "dt" });
    const dato = (titulo) => screen.getByText(titulo, { selector: "dt" }).nextSibling;
    expect(dato("Repuestos")).toHaveTextContent("3");
    expect(dato("Unidades en stock")).toHaveTextContent("43");
    expect(dato("Con stock bajo")).toHaveTextContent("1");
    expect(dato("Sin stock")).toHaveTextContent("1");

    const tabla = screen.getByRole("table");
    const filas = within(tabla).getAllByRole("row").slice(1);
    expect(filas.map((fila) => within(fila).getAllByRole("cell").map((c) => c.textContent))).toEqual([
      ["FRE-001", "Pastillas Bosch", "Bosch", "Frenos", "0", "Sin stock", "Ajustar"],
      ["FRE-002", "Discos Fremax", "Bosch", "Frenos", "3", "Stock bajo", "Ajustar"],
      ["FRE-003", "Filtro de aire", "Bosch", "Filtros", "40", "Normal", "Ajustar"],
    ]);

    await user.click(screen.getByRole("button", { name: "Sin stock (1)" }));
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
    await abrir("Proyección de demanda");

    const fila = within(await screen.findByRole("table")).getAllByRole("row")[1];
    expect(fila).toHaveTextContent("Pastillas Bosch");
    expect(within(fila).getAllByRole("cell")[2]).toHaveTextContent("60");
  });

  it("lists the parts from the most to the least urgent risk (HU 5.6)", async () => {
    const user = await abrir(/^Reposición/);
    // Abre con lo mismo que cuenta el resumen: riesgo alto y medio.
    expect(await screen.findByRole("button", { name: "Para reponer (2)" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Todos (3)" }));

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
