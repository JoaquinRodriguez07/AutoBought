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
  pedidos:
    "Avanzá cada pedido pagado: Confirmado → Empaquetando → Enviado → Entregado. Tocá uno para ver el detalle; cada cambio le llega al cliente por mail.",
  ventas: "Unidades y facturación de cada mes, y lo que se espera vender el mes que viene.",
  "mas-vendidos": "Los repuestos que más salen. Conviene que nunca falten.",
  proyeccion: "Cuánto se espera vender de cada repuesto el mes que viene, según los últimos 12 meses.",
  stock: "Cuántas unidades quedan de cada repuesto. Desde acá se ajusta el stock.",
  riesgo: "Qué repuestos se van a quedar sin stock primero, al ritmo de venta proyectado.",
  preguntar: "Preguntá en tus palabras sobre tus ventas y tu stock.",
  equipo: "Quiénes pueden entrar al portal. Sumá a alguien nuevo o dalo de baja.",
};

// Secciones sin los filtros ni "Nuevo repuesto".
const WITHOUT_FILTERS = ["preguntar", "equipo", "pedidos"];

// Secciones que usan el período (las de stock muestran el presente).
const WITH_PERIOD = ["resumen", "ventas", "mas-vendidos"];

// Dashboard del vendedor (HU 5.1 a 5.10, y el lugar de la HU 6.3 y 6.4).
// Los filtros y la sección van en la URL: al volver del detalle de un
// repuesto quedan como estaban.
export default function Dashboard({ usuario, onHome, onCerrarSesion }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [parametros, setParametros] = useSearchParams();
  const [categorias, setCategorias] = useState([]);
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [aReponer, setAReponer] = useState(null);
  // Sube después de ajustar un stock: las secciones vuelven a pedir sus datos.
  const [version, setVersion] = useState(0);

  const periodo = Number(parametros.get("periodo"));
  const filtros = {
    categoria: parametros.get("categoria") || "",
    busqueda: parametros.get("q") || "",
    meses: PERIODS.includes(periodo) ? periodo : DEFAULT_PERIOD,
  };
  // Una sección que no existe (o "Equipo" para quien no es administrador)
  // lleva al resumen.
  const vistas = viewsFor(usuario);
  const vista = vistas.some(({ valor }) => valor === parametros.get("vista")) ? parametros.get("vista") : "resumen";
  const claveStock = `${filtros.categoria}|${filtros.busqueda}|${version}`;

  // Lo que usan varias secciones (y el menú) se pide una sola vez acá.
  const stock = useQuery(() => getStock(filtros), claveStock);
  const alertas = useQuery(() => getStockoutRisk({ ...filtros, soloEnRiesgo: true }), claveStock);
  const ventas = useQuery(
    () => getSalesTrend(filtros),
    `${filtros.categoria}|${filtros.busqueda}|${filtros.meses}`
  );
  // Solo para el número del menú (pedidos pagados sin empezar a preparar).
  const pedidos = useQuery(() => getOrders({ limite: 1 }), `pedidos|${version}`);

  useEffect(() => {
    getCategories()
      .then((lista) => setCategorias(lista.map((c) => c.nombre)))
      .catch(() => setCategorias([]));
  }, []);

  const actualizarUrl = (cambios) =>
    setParametros(
      (actuales) => {
        const nuevos = new URLSearchParams(actuales);
        Object.entries(cambios).forEach(([clave, valor]) => {
          if (valor) nuevos.set(clave, valor);
          else nuevos.delete(clave);
        });
        return nuevos;
      },
      { replace: true }
    );

  const cambiarFiltros = (cambios) =>
    actualizarUrl({
      ...("categoria" in cambios ? { categoria: cambios.categoria } : {}),
      ...("busqueda" in cambios ? { q: cambios.busqueda } : {}),
      ...("meses" in cambios
        ? { periodo: cambios.meses === DEFAULT_PERIOD ? "" : String(cambios.meses) }
        : {}),
    });

  const quitarFiltros = () => actualizarUrl({ categoria: "", q: "", periodo: "" });

  // `extra`: más parámetros para la sección, como el estado del stock.
  const cambiarVista = (valor, extra = {}) => {
    actualizarUrl({ vista: valor === "resumen" ? "" : valor, estado: "", ...extra });
    window.scrollTo?.(0, 0);
  };

  const irAlDetalle = (id) => navigate(`/dashboard/repuestos/${id}`, { state: { desde: location.search } });
  // Al volver del detalle del pedido, queda donde estaba (el resumen o el listado con su filtro).
  const irAlPedido = (id) => navigate(`/dashboard/pedidos/${id}`, { state: { desde: location.search } });

  const alReponer = () => {
    setAReponer(null);
    setVersion((v) => v + 1);
  };

  // Saluda con el primer nombre ("Hola, Ana").
  const nombre = sellerName(usuario).split(/\s+/)[0];
  const titulo = vistas.find((v) => v.valor === vista).texto;
  const descripcion =
    vista === "resumen" ? `Hola${nombre ? `, ${nombre}` : ""}. Esto es lo más importante de hoy.` : DESCRIPTIONS[vista];

  // Lo mismo que cuenta "Para reponer" (riesgo alto y medio).
  const paraReponer = alertas.datos?.repuestos.length ?? 0;

  return (
    <SellerLayout
      usuario={usuario}
      vista={vista}
      onVista={cambiarVista}
      onTienda={onHome}
      onCerrarSesion={onCerrarSesion}
      avisos={{ riesgo: paraReponer, pedidos: pedidos.datos?.paraPreparar ?? 0 }}
      titulo={titulo}
      descripcion={descripcion}
      acciones={
        vista !== "equipo" && (
          <Button onClick={() => setFormularioAbierto(true)} className="h-9 px-4 hover:bg-orange-600">
            <PlusIcon />
            Nuevo repuesto
          </Button>
        )
      }
      barra={
        // Preguntarle al dashboard no usa los filtros (la pregunta los dice),
        // el equipo tampoco, y los pedidos tienen su propio filtro (por estado).
        !WITHOUT_FILTERS.includes(vista) && (
          <FilterBar
            filtros={filtros}
            categorias={categorias}
            conPeriodo={WITH_PERIOD.includes(vista)}
            onCambiar={cambiarFiltros}
            onQuitar={quitarFiltros}
          />
        )
      }
    >
      {vista === "resumen" && (
        <Overview
          filtros={filtros}
          stock={stock}
          alertas={alertas}
          ventas={ventas}
          version={version}
          onVista={cambiarVista}
          onDetalle={irAlDetalle}
          onPedido={irAlPedido}
          onReponer={setAReponer}
        />
      )}

      {vista === "pedidos" && (
        <SellerOrders
          key={parametros.get("estado") || "todos"}
          estadoInicial={parametros.get("estado") || "todos"}
          onCambio={() => setVersion((v) => v + 1)}
          onDetalle={irAlPedido}
        />
      )}
      {vista === "ventas" && (
        <Panel titulo={`Evolución de ventas · últimos ${filtros.meses} meses`} id="titulo-evolucion">
          <SalesTrend filtros={filtros} consulta={ventas} />
        </Panel>
      )}
      {vista === "mas-vendidos" && (
        <Panel
          titulo={`Los más vendidos · últimos ${filtros.meses} meses`}
          id="titulo-mas-vendidos"
          detalle="Ordenados por unidades vendidas. No cuentan los pedidos cancelados; sí los repuestos que hoy están agotados."
        >
          <BestSellers key={version} filtros={filtros} onDetalle={irAlDetalle} />
        </Panel>
      )}
      {vista === "proyeccion" && <DemandForecast key={version} filtros={filtros} onDetalle={irAlDetalle} />}
      {vista === "stock" && (
        <CurrentStock
          key={parametros.get("estado") || "todos"}
          consulta={stock}
          onDetalle={irAlDetalle}
          onReponer={setAReponer}
          estadoInicial={parametros.get("estado") || "todos"}
        />
      )}
      {vista === "riesgo" && (
        <StockoutRisk key={version} filtros={filtros} onDetalle={irAlDetalle} onReponer={setAReponer} />
      )}
      {vista === "preguntar" && <AskDashboard disponible={ASK_AVAILABLE} />}
      {vista === "equipo" && <Team usuario={usuario} />}

      <AdjustStockDialog
        abierto={aReponer !== null}
        onCambiar={(abierto) => !abierto && setAReponer(null)}
        repuesto={aReponer}
        onGuardado={alReponer}
      />
      <PartForm
        abierto={formularioAbierto}
        onCambiar={setFormularioAbierto}
        categorias={categorias}
        onGuardado={(repuesto) => {
          setFormularioAbierto(false);
          irAlDetalle(repuesto.id);
        }}
      />
    </SellerLayout>
  );
}

// El último mes cerrado y el anterior, para comparar sin el mes en curso
// (que va hasta hoy y siempre parecería una caída).
function monthsToCompare(meses = []) {
  const cerrados = meses.filter((mes) => !mes.enCurso);
  return { ultimo: cerrados.at(-1), anterior: cerrados.at(-2) };
}

function percentage(actual, anterior) {
  return actual !== undefined && anterior ? change(actual, anterior).percentage : null;
}

// "octubre de 2026" -> "octubre"
const monthOnly = (mes) => formatMonth(mes, { largo: true }).replace(/ de \d+$/, "");

// Pantalla de entrada: los números del momento, qué reponer, cómo vienen
// las ventas y qué se vende más.
function Overview({ filtros, stock, alertas, ventas, version, onVista, onDetalle, onPedido, onReponer }) {
  const { ultimo, anterior } = monthsToCompare(ventas.datos?.meses);
  const textoAnterior = anterior ? `vs. ${monthOnly(anterior.mes)}` : "";

  const repuestos = stock.datos?.repuestos ?? [];
  const sinStock = repuestos.filter((r) => r.stock <= 0).length;
  const aReponer = alertas.datos?.repuestos ?? [];
  const altos = aReponer.filter((r) => r.riesgo === "high").length;

  return (
    <div className="flex flex-col gap-6">
      {/* HU 6.3: el resumen escrito va arriba de todo. */}
      <AISummary />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <Metric
          titulo={ultimo ? `Unidades vendidas en ${monthOnly(ultimo.mes)}` : "Unidades vendidas"}
          valor={ultimo ? formatNumber(ultimo.unidades) : "—"}
          cambio={<Change percentage={percentage(ultimo?.unidades, anterior?.unidades)} texto={textoAnterior} />}
          Icon={ShoppingCartIcon}
        />
        <Metric
          titulo={ultimo ? `Facturación de ${monthOnly(ultimo.mes)}` : "Facturación"}
          valor={ultimo ? formatPesos(ultimo.facturacion) : "—"}
          cambio={<Change percentage={percentage(ultimo?.facturacion, anterior?.facturacion)} texto={textoAnterior} />}
          Icon={DollarSignIcon}
        />
        <Metric
          titulo="Para reponer"
          valor={alertas.datos ? formatNumber(aReponer.length) : "—"}
          detalle={alertas.datos ? `${formatNumber(altos)} con riesgo alto` : null}
          Icon={PackageCheckIcon}
          onClick={() => onVista("riesgo")}
          accion="Ver reposición"
        />
        <Metric
          titulo="Sin stock"
          valor={stock.datos ? formatNumber(sinStock) : "—"}
          detalle={
            stock.datos && repuestos.length > 0
              ? `${formatNumber((sinStock / repuestos.length) * 100)} % del catálogo`
              : null
          }
          Icon={PackageXIcon}
          onClick={() => onVista("stock", { estado: "agotados" })}
          accion="Ver cuáles"
        />
      </div>

      {/* Dos columnas parejas: a la izquierda, cómo vienen las ventas; a la
          derecha, lo que hay que hacer. Así ninguna deja un hueco abajo. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel titulo={`Ventas · últimos ${filtros.meses} meses`} id="titulo-ventas-resumen" className="min-w-0">
            <SalesTrend filtros={filtros} consulta={ventas} compacto />
          </Panel>
          <Panel
            titulo="Lo que más se vende"
            id="titulo-top-resumen"
            detalle={`Últimos ${filtros.meses} meses, por unidades`}
            accion={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onVista("mas-vendidos")}
                className="text-xs text-orange-600 hover:text-orange-700"
              >
                Ver ranking
                <ChevronRightIcon />
              </Button>
            }
          >
            <BestSellers key={version} filtros={filtros} onDetalle={onDetalle} limite={5} />
          </Panel>
        </div>
        {/* En celular va primero: es lo que hay que hacer. */}
        <div className="order-first xl:order-none flex flex-col gap-6">
          <OrdersToPrepare
            version={version}
            onDetalle={onPedido}
            onVerTodos={() => onVista("pedidos", { estado: "confirmed" })}
          />
          <RestockAlerts
            consulta={alertas}
            limite={5}
            onDetalle={onDetalle}
            onReponer={onReponer}
            onVerTodas={() => onVista("riesgo")}
          />
        </div>
      </div>
    </div>
  );
}
