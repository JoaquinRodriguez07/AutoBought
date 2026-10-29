import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Navbar from "../Navbar";
import { obtenerCategorias } from "../api";
import AlertasReposicion from "./AlertasReposicion";
import BarraFiltros from "./BarraFiltros";
import EvolucionVentas from "./EvolucionVentas";
import FormularioRepuesto from "./FormularioRepuesto";
import MasVendidos from "./MasVendidos";
import ProyeccionDemanda from "./ProyeccionDemanda";
import RiesgoAgotamiento from "./RiesgoAgotamiento";
import StockActual from "./StockActual";
import { obtenerStock } from "./apiDashboard";
import { PERIODOS, PERIODO_POR_DEFECTO, formatearNumero } from "./formato";
import { Indicador } from "./piezas";
import { useConsulta } from "./useConsulta";

const VISTAS = [
  ["ventas", "Evolución de ventas"],
  ["mas-vendidos", "Más vendidos"],
  ["stock", "Stock actual"],
  ["proyeccion", "Proyección"],
  ["riesgo", "Riesgo de agotamiento"],
];

// Dashboard del vendedor (HU 5.1 a 5.10). Los filtros y la pestaña van en
// la URL: al volver del detalle de un repuesto quedan como estaban.
export default function Dashboard({ usuario, onHome, onCatalogo, onLogin, onMarcas, onCerrarSesion }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [parametros, setParametros] = useSearchParams();
  const [categorias, setCategorias] = useState([]);
  const [formularioAbierto, setFormularioAbierto] = useState(false);

  const periodo = Number(parametros.get("periodo"));
  const filtros = {
    categoria: parametros.get("categoria") || "",
    busqueda: parametros.get("q") || "",
    meses: PERIODOS.includes(periodo) ? periodo : PERIODO_POR_DEFECTO,
  };
  const vista = VISTAS.some(([valor]) => valor === parametros.get("vista")) ? parametros.get("vista") : "ventas";

  const stock = useConsulta(() => obtenerStock(filtros), `${filtros.categoria}|${filtros.busqueda}`);

  useEffect(() => {
    obtenerCategorias()
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
        ? { periodo: cambios.meses === PERIODO_POR_DEFECTO ? "" : String(cambios.meses) }
        : {}),
    });

  const quitarFiltros = () => actualizarUrl({ categoria: "", q: "", periodo: "" });

  const irAlDetalle = (id) => navigate(`/dashboard/repuestos/${id}`, { state: { desde: location.search } });

  const nombre = usuario?.nombre || usuario?.email || "";
  const repuestos = stock.datos?.repuestos || [];
  const resumen = {
    repuestos: repuestos.length,
    unidades: repuestos.reduce((total, r) => total + r.stock, 0),
    stockBajo: repuestos.filter((r) => r.stock > 0 && r.stockBajo).length,
    sinStock: repuestos.filter((r) => r.stock <= 0).length,
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Navbar
        paginaActual="dashboard"
        usuario={usuario}
        onHome={onHome}
        onCatalogo={onCatalogo}
        onLogin={onLogin}
        onMarcas={onMarcas}
        onCerrarSesion={onCerrarSesion}
      />

      <main className="pt-[105px] max-w-[1100px] mx-auto px-4 sm:px-5 pb-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-orange-500 text-[9px] font-black tracking-[4px]">PORTAL DEL VENDEDOR</p>
            <h1 className="text-3xl md:text-4xl font-black italic uppercase mt-1">Dashboard del vendedor</h1>
            <p className="text-[11px] text-muted-foreground mt-2">
              Hola{nombre ? `, ${nombre}` : ""}. Ventas y stock con los datos registrados en el sistema.
            </p>
          </div>
          <Button onClick={() => setFormularioAbierto(true)} className="h-10 px-5 text-xs font-black hover:bg-orange-600">
            + NUEVO REPUESTO
          </Button>
        </div>

        <BarraFiltros filtros={filtros} categorias={categorias} onCambiar={cambiarFiltros} onQuitar={quitarFiltros} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6" aria-busy={stock.cargando}>
          <Indicador titulo="Repuestos" valor={formatearNumero(resumen.repuestos)} />
          <Indicador titulo="Unidades en stock" valor={formatearNumero(resumen.unidades)} />
          <Indicador titulo="Con stock bajo" valor={formatearNumero(resumen.stockBajo)} detalle="Con stock, pero poco" />
          <Indicador titulo="Sin stock" valor={formatearNumero(resumen.sinStock)} />
        </div>

        <AlertasReposicion filtros={filtros} onDetalle={irAlDetalle} />

        <Tabs value={vista} onValueChange={(valor) => actualizarUrl({ vista: valor === "ventas" ? "" : valor })} className="mt-10">
          {/* En celular las pestañas se desplazan de costado. */}
          <div className="overflow-x-auto border-b">
            <TabsList variant="line" className="h-10">
              {VISTAS.map(([valor, texto]) => (
                <TabsTrigger
                  key={valor}
                  value={valor}
                  className="flex-none px-3 font-semibold after:bg-primary data-active:text-orange-600"
                >
                  {texto}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="pt-4">
            <TabsContent value="ventas">
              <EvolucionVentas filtros={filtros} />
            </TabsContent>
            <TabsContent value="mas-vendidos">
              <MasVendidos filtros={filtros} onDetalle={irAlDetalle} />
            </TabsContent>
            <TabsContent value="stock">
              <StockActual consulta={stock} onDetalle={irAlDetalle} />
            </TabsContent>
            <TabsContent value="proyeccion">
              <ProyeccionDemanda filtros={filtros} onDetalle={irAlDetalle} />
            </TabsContent>
            <TabsContent value="riesgo">
              <RiesgoAgotamiento filtros={filtros} onDetalle={irAlDetalle} />
            </TabsContent>
          </div>
        </Tabs>
      </main>

      <FormularioRepuesto
        abierto={formularioAbierto}
        onCambiar={setFormularioAbierto}
        categorias={categorias}
        onGuardado={(repuesto) => {
          setFormularioAbierto(false);
          irAlDetalle(repuesto.id);
        }}
      />
    </div>
  );
}
