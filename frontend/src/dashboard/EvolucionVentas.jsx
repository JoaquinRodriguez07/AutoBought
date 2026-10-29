import { useState } from "react";
import { obtenerEvolucionVentas } from "./apiDashboard";
import { formatearMes, formatearNumero } from "./formato";
import GraficoVentas from "./GraficoVentas";
import { EstadoConsulta, Opciones, TituloSeccion } from "./piezas";
import { useConsulta } from "./useConsulta";

// Evolución mensual de las ventas (HU 5.4), con la proyección del mes que
// viene en el mismo gráfico (HU 5.5). La proyección es en unidades.
export default function EvolucionVentas({ filtros }) {
  const [metrica, setMetrica] = useState("unidades");
  const consulta = useConsulta(
    () => obtenerEvolucionVentas(filtros),
    `${filtros.categoria}|${filtros.busqueda}|${filtros.meses}`
  );

  const alcance = [filtros.categoria, filtros.busqueda && `«${filtros.busqueda}»`].filter(Boolean).join(" · ");

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TituloSeccion
          detalle={`${alcance || "Toda la tienda"}. Los pedidos cancelados no cuentan; el último mes va hasta hoy.`}
        >
          Evolución de ventas · últimos {filtros.meses} meses
        </TituloSeccion>

        <Opciones
          etiqueta="Qué mostrar"
          valor={metrica}
          onCambiar={setMetrica}
          opciones={[
            ["unidades", "Unidades"],
            ["facturacion", "Facturación"],
          ]}
        />
      </div>

      <EstadoConsulta consulta={consulta}>
        {({ meses, proyeccion }) => (
          <>
            <GraficoVentas
              meses={meses}
              proyeccion={proyeccion}
              metrica={metrica}
              titulo={`Evolución de ventas de los últimos ${filtros.meses} meses`}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Demanda proyectada para {formatearMes(proyeccion.mes, { largo: true })}:{" "}
              <strong className="text-foreground">{formatearNumero(proyeccion.unidades)} unidades</strong>. Es una
              regresión lineal sobre los últimos 12 meses, con el mes en curso llevado a mes completo.
            </p>
          </>
        )}
      </EstadoConsulta>
    </section>
  );
}
