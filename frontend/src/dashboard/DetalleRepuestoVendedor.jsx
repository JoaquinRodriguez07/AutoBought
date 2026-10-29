import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Navbar from "../Navbar";
import { Button } from "@/components/ui/button";
import DialogoAjustarStock from "./DialogoAjustarStock";
import FormularioRepuesto from "./FormularioRepuesto";
import GraficoVentas from "./GraficoVentas";
import { obtenerDetalleRepuesto } from "./apiDashboard";
import { formatearDias, formatearMes, formatearNumero, formatearPesos } from "./formato";
import { EstadoConsulta, Indicador, InsigniaRiesgo, InsigniaStock, SinDatos } from "./piezas";
import { useConsulta } from "./useConsulta";

// Detalle de un repuesto para el vendedor (HU 5.8): stock, ventas,
// evolución, proyección y riesgo. Desde acá se edita y se repone (HU 5.10).
export default function DetalleRepuestoVendedor({ usuario, onHome, onCatalogo, onLogin, onMarcas, onCerrarSesion }) {
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
        <Button variant="ghost" size="sm" onClick={volver} className="-ml-2 text-xs font-black text-muted-foreground">
          ← Volver al dashboard
        </Button>

        <EstadoConsulta consulta={consulta}>
          {(repuesto) => (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4 mt-4">
                <div>
                  <p className="text-orange-500 text-[9px] font-black tracking-[4px] uppercase">
                    {repuesto.categoria} · {repuesto.codigo}
                  </p>
                  <h1 className="text-2xl md:text-3xl font-black mt-1">{repuesto.nombre}</h1>
                  <p className="text-xs text-muted-foreground mt-1">
                    {repuesto.fabricante} · {formatearPesos(repuesto.precio)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setDialogo("stock")} className="h-10 px-4 text-xs font-black hover:bg-orange-600">
                    AJUSTAR STOCK
                  </Button>
                  <Button variant="outline" onClick={() => setDialogo("editar")} className="h-10 px-4 text-xs font-black">
                    EDITAR
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
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

              <section className="mt-10">
                <h2 className="text-lg font-black">Ventas de los últimos 12 meses y proyección</h2>
                {repuesto.unidadesVendidas === 0 ? (
                  <div className="mt-3">
                    <SinDatos>Este repuesto todavía no registra ventas</SinDatos>
                  </div>
                ) : (
                  <div className="mt-4">
                    <GraficoVentas
                      meses={repuesto.meses}
                      proyeccion={repuesto.proyeccion}
                      titulo={`Ventas reales y demanda proyectada de ${repuesto.nombre}`}
                    />
                  </div>
                )}
              </section>

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
      </main>
    </div>
  );
}
