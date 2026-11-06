import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeftIcon, PackagePlusIcon, PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import DialogoAjustarStock from "./DialogoAjustarStock";
import FormularioRepuesto from "./FormularioRepuesto";
import GraficoVentas from "./GraficoVentas";
import LayoutVendedor from "./LayoutVendedor";
import { obtenerDetalleRepuesto } from "./apiDashboard";
import { formatearDias, formatearMes, formatearNumero, formatearPesos } from "./formato";
import { EstadoConsulta, Indicador, InsigniaRiesgo, InsigniaStock, Panel, SinDatos } from "./piezas";
import { useConsulta } from "./useConsulta";
import { imagenesExtraDeTipo } from "../imagenesRepuestos";
import { imagenDeRepuesto, usarImagenGenerica } from "../mapearRepuesto";

// La foto del repuesto, la misma que ve el cliente en la tienda (la de su
// tipo de pieza y fabricante), con la segunda vista si la hay.
function FotoRepuesto({ nombre }) {
  const fotos = [imagenDeRepuesto(nombre), ...imagenesExtraDeTipo(nombre)];
  const [activa, setActiva] = useState(0);
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="grid aspect-square place-items-center rounded-lg bg-white">
        <img
          key={fotos[activa]}
          src={fotos[activa]}
          onError={usarImagenGenerica}
          alt={`Foto de ${nombre}`}
          className="max-h-full w-full object-contain p-2"
        />
      </div>
      {fotos.length > 1 && (
        <div className="flex gap-2">
          {fotos.map((foto, indice) => (
            <button
              key={foto}
              type="button"
              onClick={() => setActiva(indice)}
              aria-label={`Ver foto ${indice + 1}`}
              aria-pressed={activa === indice}
              className={cn(
                "size-14 overflow-hidden rounded-md border-2 bg-white p-1",
                activa === indice ? "border-orange-500" : "border-gray-200 hover:border-gray-300"
              )}
            >
              <img src={foto} onError={usarImagenGenerica} alt="" className="size-full object-contain" />
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Así se ve en la tienda.</p>
    </div>
  );
}

// Detalle de un repuesto para el vendedor (HU 5.8): stock, ventas,
// evolución, proyección y riesgo. Desde acá se edita y se repone (HU 5.10).
export default function DetalleRepuestoVendedor({ usuario, onHome, onCerrarSesion }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [dialogo, setDialogo] = useState(null); // "editar" | "stock" | null
  const consulta = useConsulta(() => obtenerDetalleRepuesto(id), id);

  const volver = () => navigate(`/dashboard${location.state?.desde || ""}`);

  const alGuardar = () => {
    setDialogo(null);
    consulta.recargar();
  };

  const repuesto = consulta.datos;

  return (
    <LayoutVendedor
      usuario={usuario}
      vista={null}
      onVista={(valor) => navigate(valor === "resumen" ? "/dashboard" : `/dashboard?vista=${valor}`)}
      onTienda={onHome}
      onCerrarSesion={onCerrarSesion}
      antesDelTitulo={
        <Button
          variant="ghost"
          size="sm"
          onClick={volver}
          className="-ml-2 mb-3 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon />
          Volver al dashboard
        </Button>
      }
      titulo={repuesto?.nombre ?? "Repuesto"}
      descripcion={
        repuesto && `${repuesto.codigo} · ${repuesto.categoria} · ${repuesto.fabricante} · ${formatearPesos(repuesto.precio)}`
      }
      acciones={
        repuesto && (
          <>
            <Button
              variant="outline"
              onClick={() => setDialogo("editar")}
              className="h-9 px-4"
            >
              <PencilIcon />
              Editar
            </Button>
            <Button onClick={() => setDialogo("stock")} className="h-9 px-4 hover:bg-orange-600">
              <PackagePlusIcon />
              Ajustar stock
            </Button>
          </>
        )
      }
    >
      <div>
        <EstadoConsulta consulta={consulta}>
          {(repuesto) => (
            <>
              {/* La foto al lado de los números: el vendedor ve qué pieza es. */}
              <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] gap-6 items-start">
                <FotoRepuesto key={repuesto.id} nombre={repuesto.nombre} />
                <div className="grid grid-cols-2 gap-4">
                  <Indicador
                    titulo="Stock actual"
                    valor={formatearNumero(repuesto.stock)}
                    detalle={<InsigniaStock stock={repuesto.stock} stockBajo={repuesto.stockBajo} />}
                  />
                  <Indicador titulo="Unidades vendidas" valor={formatearNumero(repuesto.unidadesVendidas)} detalle="Todas las ventas registradas" />
                  <Indicador
                    titulo="Demanda proyectada"
                    valor={formatearNumero(repuesto.demandaProyectada)}
                    detalle={`Unidades en ${formatearMes(repuesto.proyeccion.mes, { largo: true })}`}
                  />
                  <Indicador
                    titulo="Cobertura"
                    valor={formatearDias(repuesto.diasCobertura)}
                    detalle={<InsigniaRiesgo riesgo={repuesto.riesgo} />}
                  />
                </div>
              </div>

              <Panel titulo="Ventas de los últimos 12 meses y proyección" id="titulo-ventas-repuesto" className="mt-6">
                {repuesto.unidadesVendidas === 0 ? (
                  <SinDatos>Este repuesto todavía no registra ventas</SinDatos>
                ) : (
                  <GraficoVentas
                    meses={repuesto.meses}
                    proyeccion={repuesto.proyeccion}
                    titulo={`Ventas reales y demanda proyectada de ${repuesto.nombre}`}
                  />
                )}
              </Panel>

              <DialogoAjustarStock
                abierto={dialogo === "stock"}
                onCambiar={(abierto) => setDialogo(abierto ? "stock" : null)}
                repuesto={repuesto}
                onGuardado={alGuardar}
              />
              <FormularioRepuesto
                abierto={dialogo === "editar"}
                onCambiar={(abierto) => setDialogo(abierto ? "editar" : null)}
                repuestoId={repuesto.id}
                onGuardado={alGuardar}
              />
            </>
          )}
        </EstadoConsulta>
      </div>
    </LayoutVendedor>
  );
}
