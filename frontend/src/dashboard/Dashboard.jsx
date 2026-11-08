// El portal del vendedor: secciones y rutas del dashboard.

import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRightIcon, DollarSignIcon, PackageCheckIcon, PackageXIcon, PlusIcon, ShoppingCartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCategories } from "../api";
import RestockAlerts from "./RestockAlerts";
import FilterBar from "./FilterBar";
import AdjustStockDialog from "./AdjustStockDialog";
import SalesTrend from "./SalesTrend";
import PartForm from "./PartForm";
import Team from "./Team";
import SellerLayout, { sellerName } from "./SellerLayout";
import { viewsFor } from "./sections";
import BestSellers from "./BestSellers";
import OrdersToPrepare from "./OrdersToPrepare";
import SellerOrders from "./SellerOrders";
import AskDashboard from "./AskDashboard";
import DemandForecast from "./DemandForecast";
import AISummary from "./AISummary";
import StockoutRisk from "./StockoutRisk";
import CurrentStock from "./CurrentStock";
import { getSalesTrend, getOrders, getStockoutRisk, getStock } from "./dashboardApi";
import { PERIODS, DEFAULT_PERIOD, formatMonth, formatNumber, formatPesos, change } from "./format";
import { Change, Metric, Panel } from "./pieces";
import { useQuery } from "./useQuery";

// Pasar a true cuando el backend tenga POST /analytics/preguntar (HU 6.4).
const ASK_AVAILABLE = false;

// Qué cuenta cada sección, debajo del título.
const DESCRIPTIONS = {
  orders:
    "Avanzá cada pedido pagado: Confirmado → Empaquetando → Enviado → Entregado. Tocá uno para ver el detalle; cada cambio le llega al cliente por mail.",
  sales: "Unidades y facturación de cada mes, y lo que se espera vender el mes que viene.",
  "mas-vendidos": "Los repuestos que más salen. Conviene que nunca falten.",
  forecast: "Cuánto se espera vender de cada repuesto el mes que viene, según los últimos 12 meses.",
  stock: "Cuántas unidades quedan de cada repuesto. Desde acá se ajusta el stock.",
  risk: "Qué repuestos se van a quedar sin stock primero, al ritmo de venta proyectado.",
  ask: "Preguntá en tus palabras sobre tus ventas y tu stock.",
  team: "Quiénes pueden entrar al portal. Sumá a alguien nuevo o dalo de baja.",
};

// Secciones sin los filtros ni "Nuevo repuesto".
const WITHOUT_FILTERS = ["ask", "team", "orders"];

// Secciones que usan el período (las de stock muestran el presente).
const WITH_PERIOD = ["summary", "sales", "mas-vendidos"];

// Dashboard del vendedor (HU 5.1 a 5.10, y el lugar de la HU 6.3 y 6.4).
// Los filtros y la sección van en la URL: al volver del detalle de un
// repuesto quedan como estaban.
export default function Dashboard({ sessionUser, onHome, onCloseSession }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [parametros, setParametros] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [toRestock, setToRestock] = useState(null);
  // Sube después de ajustar un stock: las secciones vuelven a pedir sus datos.
  const [version, setVersion] = useState(0);

  const periodo = Number(parametros.get("periodo"));
  const filters = {
    categoria: parametros.get("categoria") || "",
    search: parametros.get("q") || "",
    months: PERIODS.includes(periodo) ? periodo : DEFAULT_PERIOD,
  };
  // Una sección que no existe (o "Equipo" para quien no es administrador)
  // lleva al resumen.
  const views = viewsFor(sessionUser);
  const vista = views.some(({ rawValue }) => rawValue === parametros.get("vista")) ? parametros.get("vista") : "summary";
  const keyStock = `${filters.categoria}|${filters.search}|${version}`;

  // Lo que usan varias secciones (y el menú) se pide una sola vez acá.
  const stock = useQuery(() => getStock(filters), keyStock);
  const alertas = useQuery(() => getStockoutRisk({ ...filters, onlyInRisk: true }), keyStock);
  const sales = useQuery(
    () => getSalesTrend(filters),
    `${filters.categoria}|${filters.search}|${filters.months}`
  );
  // Solo para el número del menú (pedidos pagados sin empezar a preparar).
  const orders = useQuery(() => getOrders({ limit: 1 }), `pedidos|${version}`);

  useEffect(() => {
    getCategories()
      .then((list) => setCategories(list.map((c) => c.displayName)))
      .catch(() => setCategories([]));
  }, []);

  const updateUrl = (cambios) =>
    setParametros(
      (actuales) => {
        const newItems = new URLSearchParams(actuales);
        Object.entries(cambios).forEach(([key, rawValue]) => {
          if (rawValue) newItems.set(key, rawValue);
          else newItems.delete(key);
        });
        return newItems;
      },
      { replace: true }
    );

  const changeFilters = (cambios) =>
    updateUrl({
      ...("categoria" in cambios ? { categoria: cambios.categoria } : {}),
      ...("search" in cambios ? { q: cambios.search } : {}),
      ...("months" in cambios
        ? { periodo: cambios.months === DEFAULT_PERIOD ? "" : String(cambios.months) }
        : {}),
    });

  const removeFilters = () => updateUrl({ categoria: "", q: "", periodo: "" });

  // `extra`: más parámetros para la sección, como el estado del stock.
  const changeView = (rawValue, extra = {}) => {
    updateUrl({ vista: rawValue === "summary" ? "" : rawValue, estado: "", ...extra });
    window.scrollTo?.(0, 0);
  };

  const goToDetail = (id) => navigate(`/dashboard/repuestos/${id}`, { state: { from: location.search } });
  // Al volver del detalle del pedido, queda donde estaba (el resumen o el listado con su filtro).
  const goToOrder = (id) => navigate(`/dashboard/pedidos/${id}`, { state: { from: location.search } });

  const handleRestock = () => {
    setToRestock(null);
    setVersion((v) => v + 1);
  };

  // Saluda con el primer nombre ("Hola, Ana").
  const displayName = sellerName(sessionUser).split(/\s+/)[0];
  const title = views.find((v) => v.rawValue === vista).texto;
  const description =
    vista === "summary" ? `Hola${displayName ? `, ${displayName}` : ""}. Esto es lo más importante de hoy.` : DESCRIPTIONS[vista];

  // Lo mismo que cuenta "Para reponer" (riesgo alto y medio).
  const forRestock = alertas.info?.repuestos.length ?? 0;

  return (
    <SellerLayout
      sessionUser={sessionUser}
      vista={vista}
      onView={changeView}
      onStore={onHome}
      onCloseSession={onCloseSession}
      notices={{ risk: forRestock, orders: orders.info?.forPrepare ?? 0 }}
      title={title}
      description={description}
      actions={
        vista !== "team" && (
          <Button onClick={() => setFormOpen(true)} className="h-9 px-4 hover:bg-orange-600">
            <PlusIcon />
            Nuevo repuesto
          </Button>
        )
      }
      bar={
        // Preguntarle al dashboard no usa los filtros (la pregunta los dice),
        // el equipo tampoco, y los pedidos tienen su propio filtro (por estado).
        !WITHOUT_FILTERS.includes(vista) && (
          <FilterBar
            filters={filters}
            categories={categories}
            withPeriod={WITH_PERIOD.includes(vista)}
            onChange={changeFilters}
            onRemove={removeFilters}
          />
        )
      }
    >
      {vista === "summary" && (
        <Overview
          filters={filters}
          stock={stock}
          alertas={alertas}
          sales={sales}
          version={version}
          onView={changeView}
          onDetail={goToDetail}
          onOrder={goToOrder}
          onRestock={setToRestock}
        />
      )}

      {vista === "orders" && (
        <SellerOrders
          key={parametros.get("estado") || "all"}
          initialStatus={parametros.get("estado") || "all"}
          onCambio={() => setVersion((v) => v + 1)}
          onDetail={goToOrder}
        />
      )}
      {vista === "sales" && (
        <Panel title={`Evolución de ventas · últimos ${filters.months} meses`} id="titulo-evolucion">
          <SalesTrend filters={filters} queryState={sales} />
        </Panel>
      )}
      {vista === "mas-vendidos" && (
        <Panel
          title={`Los más vendidos · últimos ${filters.months} meses`}
          id="titulo-mas-vendidos"
          details="Ordenados por unidades vendidas. No cuentan los pedidos cancelados; sí los repuestos que hoy están agotados."
        >
          <BestSellers key={version} filters={filters} onDetail={goToDetail} />
        </Panel>
      )}
      {vista === "forecast" && <DemandForecast key={version} filters={filters} onDetail={goToDetail} />}
      {vista === "stock" && (
        <CurrentStock
          key={parametros.get("estado") || "all"}
          queryState={stock}
          onDetail={goToDetail}
          onRestock={setToRestock}
          initialStatus={parametros.get("estado") || "all"}
        />
      )}
      {vista === "risk" && (
        <StockoutRisk key={version} filters={filters} onDetail={goToDetail} onRestock={setToRestock} />
      )}
      {vista === "ask" && <AskDashboard disponible={ASK_AVAILABLE} />}
      {vista === "team" && <Team sessionUser={sessionUser} />}

      <AdjustStockDialog
        isOpen={toRestock !== null}
        onChange={(isOpen) => !isOpen && setToRestock(null)}
        part={toRestock}
        onSaved={handleRestock}
      />
      <PartForm
        isOpen={formOpen}
        onChange={setFormOpen}
        categories={categories}
        onSaved={(part) => {
          setFormOpen(false);
          goToDetail(part.id);
        }}
      />
    </SellerLayout>
  );
}

// El último mes cerrado y el anterior, para comparar sin el mes en curso
// (que va hasta hoy y siempre parecería una caída).
function monthsToCompare(months = []) {
  const closed = months.filter((month) => !month.inProgress);
  return { last: closed.at(-1), previous: closed.at(-2) };
}

function percentage(current, previous) {
  return current !== undefined && previous ? change(current, previous).percentage : null;
}

// "octubre de 2026" -> "octubre"
const monthOnly = (month) => formatMonth(month, { long: true }).replace(/ de \d+$/, "");

// Pantalla de entrada: los números del momento, qué reponer, cómo vienen
// las ventas y qué se vende más.
function Overview({ filters, stock, alertas, sales, version, onView, onDetail, onOrder, onRestock }) {
  const { last, previous } = monthsToCompare(sales.info?.months);
  const previousText = previous ? `vs. ${monthOnly(previous.month)}` : "";

  const repuestos = stock.info?.repuestos ?? [];
  const withoutStock = repuestos.filter((r) => r.stock <= 0).length;
  const toRestock = alertas.info?.repuestos ?? [];
  const altos = toRestock.filter((r) => r.risk === "high").length;

  return (
    <div className="flex flex-col gap-6">
      {/* HU 6.3: el resumen escrito va arriba de todo. */}
      <AISummary />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <Metric
          title={last ? `Unidades vendidas en ${monthOnly(last.month)}` : "Unidades vendidas"}
          rawValue={last ? formatNumber(last.units) : "—"}
          cambio={<Change percentage={percentage(last?.units, previous?.units)} texto={previousText} />}
          Icon={ShoppingCartIcon}
        />
        <Metric
          title={last ? `Facturación de ${monthOnly(last.month)}` : "Facturación"}
          rawValue={last ? formatPesos(last.revenue) : "—"}
          cambio={<Change percentage={percentage(last?.revenue, previous?.revenue)} texto={previousText} />}
          Icon={DollarSignIcon}
        />
        <Metric
          title="Para reponer"
          rawValue={alertas.info ? formatNumber(toRestock.length) : "—"}
          details={alertas.info ? `${formatNumber(altos)} con riesgo alto` : null}
          Icon={PackageCheckIcon}
          onClick={() => onView("risk")}
          action="Ver reposición"
        />
        <Metric
          title="Sin stock"
          rawValue={stock.info ? formatNumber(withoutStock) : "—"}
          details={
            stock.info && repuestos.length > 0
              ? `${formatNumber((withoutStock / repuestos.length) * 100)} % del catálogo`
              : null
          }
          Icon={PackageXIcon}
          onClick={() => onView("stock", { estado: "soldOut" })}
          action="Ver cuáles"
        />
      </div>

      {/* Dos columnas parejas: a la izquierda, cómo vienen las ventas; a la
          derecha, lo que hay que hacer. Así ninguna deja un hueco abajo. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title={`Ventas · últimos ${filters.months} meses`} id="titulo-ventas-resumen" className="min-w-0">
            <SalesTrend filters={filters} queryState={sales} compact />
          </Panel>
          <Panel
            title="Lo que más se vende"
            id="titulo-top-resumen"
            details={`Últimos ${filters.months} meses, por unidades`}
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onView("mas-vendidos")}
                className="text-xs text-orange-600 hover:text-orange-700"
              >
                Ver ranking
                <ChevronRightIcon />
              </Button>
            }
          >
            <BestSellers key={version} filters={filters} onDetail={onDetail} limit={5} />
          </Panel>
        </div>
        {/* En celular va primero: es lo que hay que hacer. */}
        <div className="order-first xl:order-none flex flex-col gap-6">
          <OrdersToPrepare
            version={version}
            onDetail={onOrder}
            onSeeAll={() => onView("orders", { estado: "confirmed" })}
          />
          <RestockAlerts
            queryState={alertas}
            limit={5}
            onDetail={onDetail}
            onRestock={onRestock}
            onSeeAll={() => onView("risk")}
          />
        </div>
      </div>
    </div>
  );
}
