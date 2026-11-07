import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { confirmarRecepcion, crearLinkPago, obtenerDetalleCompra, obtenerHistorialCompras } from "./api";
import { usePedidos } from "./context/PedidosContext";
import CuentaLayout from "./CuentaLayout";
import DetallePedido from "./DetallePedido";
import { IconoCamion } from "./Iconos";
import PestanasCompras from "./PestanasCompras";
import { irA } from "./redirigir";
import { estaEnCurso, formatearFecha } from "./seguimientoPedido";
import TarjetaPedidoEnCurso from "./TarjetaPedidoEnCurso";

function Cargando({ texto }) {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">{texto}</span>
      {[0, 1].map((i) => (
        <div key={i} aria-hidden="true" className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
          <div className="h-5 w-48 bg-gray-100 rounded" />
          <div className="h-3 w-full bg-gray-100 rounded mt-6" />
          <div className="flex gap-2 mt-6">
            <div className="w-14 h-14 bg-gray-100 rounded-md" />
            <div className="w-14 h-14 bg-gray-100 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * «Mis compras › En curso» (/pedidos, el ícono de la barra): los pedidos
 * que todavía no terminaron, con qué pasa ahora con cada uno, su progreso
 * y lo que se puede hacer (pagar o avisar que llegó). Las que ya
 * terminaron están en la otra pestaña, «Anteriores» (/historial). El
 * detalle de un pedido está en /pedidos/:id.
 */
export default function MisPedidos(propsNavbar) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { establecer } = usePedidos();

  const [compras, setCompras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [detalle, setDetalle] = useState(null);
  const [errorDetalle, setErrorDetalle] = useState("");

  // El pedido con una acción en marcha (pagar o «Ya lo recibí»).
  const [pagandoId, setPagandoId] = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [entregadoId, setEntregadoId] = useState(null);
  const ocupado = pagandoId !== null || confirmandoId !== null;

  useEffect(() => {
    let cancelado = false;

    const cargar = async () => {
      setCargando(true);
      setError("");
      try {
        const lista = await obtenerHistorialCompras();
        if (!cancelado) {
          setCompras(lista);
          establecer(lista);
        }
      } catch (errorCarga) {
        if (!cancelado) setError(errorCarga.message || "No pudimos cargar tus pedidos.");
      } finally {
        if (!cancelado) setCargando(false);
      }
    };

    cargar();
    return () => {
      cancelado = true;
    };
  }, [establecer]);

  useEffect(() => {
    if (!id) return undefined;
    let cancelado = false;

    const cargar = async () => {
      setErrorDetalle("");
      try {
        const pedido = await obtenerDetalleCompra(id);
        if (!cancelado) setDetalle(pedido);
      } catch (errorCarga) {
        if (!cancelado) setErrorDetalle(errorCarga.message || "No pudimos cargar el pedido.");
      }
    };

    cargar();
    return () => {
      cancelado = true;
    };
  }, [id]);

  // El detalle cargado corresponde al pedido de la dirección.
  const compraSeleccionada = id && detalle && String(detalle.id) === String(id) ? detalle : null;

  const reemplazar = (actualizada) => {
    const lista = compras.map((anterior) => (anterior.id === actualizada.id ? actualizada : anterior));
    setCompras(lista);
    establecer(lista);
  };

  const pagar = async (compra) => {
    setPagandoId(compra.id);
    setError("");
    try {
      irA(await crearLinkPago(compra.id));
    } catch (errorPago) {
      setError(errorPago.message || "No pudimos abrir Mercado Pago.");
      setPagandoId(null);
    }
  };

  const confirmarLlegada = async (compra) => {
    setConfirmandoId(compra.id);
    setError("");
    try {
      const entregada = await confirmarRecepcion(compra.id);
      reemplazar(entregada);
      setEntregadoId(entregada.id);
    } catch (errorRecepcion) {
      setError(errorRecepcion.message || "No pudimos confirmar la llegada del pedido.");
    } finally {
      setConfirmandoId(null);
    }
  };

  const enCurso = compras.filter(estaEnCurso);

  return (
    <CuentaLayout
      {...propsNavbar}
      seccion="compras"
      migas={
        id
          ? [
              { texto: "Inicio", ir: propsNavbar.onHome },
              { texto: "Mi cuenta", ir: () => navigate("/cuenta") },
              { texto: "Mis compras", ir: () => navigate("/pedidos") },
              `Pedido #${id}`,
            ]
          : undefined
      }
      titulo={id ? `Pedido #${id}` : "Mis compras"}
      descripcion={id && compraSeleccionada ? `Realizado el ${formatearFecha(compraSeleccionada.fecha)}` : undefined}
    >
          {!id && <PestanasCompras actual="enCurso" />}

          {id ? (
            errorDetalle ? (
              <>
                <p role="alert" className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-3 text-sm font-bold mb-6">
                  {errorDetalle}
                </p>
                <button type="button" onClick={() => navigate("/pedidos")} className="text-orange-500 text-sm font-bold hover:underline">
                  ← Volver a mis compras
                </button>
              </>
            ) : compraSeleccionada ? (
              <DetallePedido
                key={compraSeleccionada.id}
                compra={compraSeleccionada}
                textoVolver="← Volver a mis compras"
                onVolver={() => navigate("/pedidos")}
                onActualizado={(entregada) => {
                  setDetalle(entregada);
                  reemplazar(entregada);
                }}
              />
            ) : (
              <Cargando texto="Cargando el pedido..." />
            )
          ) : cargando ? (
            <Cargando texto="Cargando tus pedidos..." />
          ) : (
            <>
              {error && (
                <p role="alert" className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-3 text-sm font-bold mb-6">
                  {error}
                </p>
              )}

              {entregadoId !== null && (
                <p role="status" className="bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-sm font-bold mb-6">
                  ¡Listo! Marcamos el pedido #{entregadoId} como entregado. Te mandamos un mail con el resumen.
                  Lo vas a encontrar en «Anteriores».
                </p>
              )}

              {enCurso.length > 0 ? (
                <ul aria-label="Pedidos en curso" className="space-y-4">
                  {enCurso.map((compra) => (
                    <TarjetaPedidoEnCurso
                      key={compra.id}
                      compra={compra}
                      onVerDetalle={(elegida) => navigate(`/pedidos/${elegida.id}`)}
                      onPagar={pagar}
                      onRecibido={confirmarLlegada}
                      pagando={pagandoId === compra.id}
                      confirmando={confirmandoId === compra.id}
                      ocupado={ocupado}
                    />
                  ))}
                </ul>
              ) : (
                !error && (
                  <div className="text-center py-16 bg-white border border-dashed border-gray-300 rounded-xl">
                    <IconoCamion className="w-10 h-10 mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500 text-sm font-bold">No tenés pedidos en curso.</p>
                    <p className="text-gray-400 text-xs mt-2">Cuando compres algo, vas a poder seguirlo acá.</p>
                    <button
                      type="button"
                      onClick={() => propsNavbar.onCatalogo?.()}
                      className="mt-6 h-10 px-5 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition"
                    >
                      Ver repuestos
                    </button>
                  </div>
                )
              )}
            </>
          )}
    </CuentaLayout>
  );
}
