import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { crearLinkPago, obtenerDetalleCompra } from "./api";
import { irA } from "./redirigir";
import TarjetaCuenta, { claseBotonCuenta } from "./TarjetaCuenta";

// Mientras Mercado Pago no avisa al backend, el pago figura pendiente: se
// vuelve a preguntar unas veces antes de decir "está en proceso".
const ESPERA_MS = 3000;
const CONSULTAS = 10;

// Lo que Mercado Pago agrega a la dirección al volver ("null" si el
// cliente volvió sin pagar). Solo sirve para no hacer esperar a quien ya
// sabemos que no pagó: el pago aprobado lo confirma siempre el backend.
const SIN_PAGAR = ["rejected", "cancelled", "null"];

/**
 * A esta pantalla vuelve el cliente desde Mercado Pago (?pedido=<id>).
 * Muestra el estado del pago según el backend y, si no se pudo pagar,
 * deja reintentar.
 */
export default function ResultadoPago({ onHistorial, ...propsNavbar }) {
  const [searchParams] = useSearchParams();
  const pedidoId = searchParams.get("pedido") || "";
  const estadoMP = searchParams.get("collection_status") || searchParams.get("status") || "";

  // "consultando" | "aprobado" | "rechazado" | "en-proceso" | "error"
  const [estado, setEstado] = useState(pedidoId ? "consultando" : "error");
  const [error, setError] = useState(pedidoId ? "" : "No encontramos ese pedido.");
  const [reintentando, setReintentando] = useState(false);

  // En desarrollo, StrictMode corre los efectos dos veces: con esto se
  // consulta una sola vez.
  const iniciado = useRef(false);

  useEffect(() => {
    if (!pedidoId || iniciado.current) return;
    iniciado.current = true;

    let consultas = 0;
    let temporizador;
    const consultar = async () => {
      consultas += 1;
      try {
        const { estadoPago } = await obtenerDetalleCompra(pedidoId);
        if (estadoPago === "approved" || estadoPago === null) {
          setEstado("aprobado");
        } else if (estadoPago === "rejected" || SIN_PAGAR.includes(estadoMP)) {
          setEstado("rechazado");
        } else if (consultas < CONSULTAS) {
          temporizador = setTimeout(consultar, ESPERA_MS);
        } else {
          setEstado("en-proceso");
        }
      } catch (err) {
        setEstado("error");
        setError(err.message);
      }
    };
    consultar();
    return () => clearTimeout(temporizador);
  }, [pedidoId, estadoMP]);

  const reintentar = async () => {
    setReintentando(true);
    setError("");
    try {
      irA(await crearLinkPago(pedidoId));
    } catch (err) {
      setError(err.message);
      setReintentando(false);
    }
  };

  return (
    <TarjetaCuenta titulo={pedidoId ? `Pedido #${pedidoId}` : "Pago"} {...propsNavbar}>
      {estado === "consultando" && (
        <p role="status" className="mt-6 text-[10px] text-gray-500">
          Estamos confirmando tu pago...
        </p>
      )}

      {estado === "aprobado" && (
        <div role="status" className="mt-6 bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-[10px] font-semibold">
          ¡Pago aprobado! Tu compra está confirmada y te mandamos el detalle por mail.
        </div>
      )}

      {estado === "en-proceso" && (
        <div role="status" className="mt-6 bg-orange-50 border border-orange-200 text-orange-700 rounded-md px-4 py-3 text-[10px] font-semibold">
          Tu pago está en proceso. Cuando Mercado Pago lo apruebe, te avisamos por mail.
        </div>
      )}

      {estado === "rechazado" && (
        <>
          <div role="alert" className="mt-6 bg-red-50 border border-red-200 text-red-500 rounded-md px-4 py-3 text-[9px] font-semibold">
            El pago no se pudo completar. Tus repuestos siguen reservados: podés intentarlo de nuevo.
          </div>
          <button type="button" onClick={reintentar} disabled={reintentando} className={claseBotonCuenta}>
            {reintentando ? "ABRIENDO MERCADO PAGO..." : "REINTENTAR PAGO"}
          </button>
        </>
      )}

      {error && (
        <div role="alert" className="mt-6 bg-red-50 border border-red-200 text-red-500 rounded-md px-4 py-3 text-[9px] font-semibold">
          {error}
        </div>
      )}

      {estado !== "consultando" && (
        <button
          type="button"
          onClick={estado === "error" ? () => propsNavbar.onCatalogo() : onHistorial}
          className="w-full mt-3 py-2 text-[11px] font-bold text-gray-500 hover:text-orange-500"
        >
          {estado === "error" ? "Ir a la tienda" : "Ver mis compras"}
        </button>
      )}
    </TarjetaCuenta>
  );
}
