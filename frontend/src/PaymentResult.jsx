import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPaymentLink, getPurchaseDetail, verifyPayment } from "./api";
import { useOrders } from "./context/OrdersContext";
import { goTo } from "./redirect";
import AccountCard, { accountButtonClass } from "./AccountCard";

// Mientras Mercado Pago no avisa al backend, el pago figura pendiente: se
// vuelve a preguntar unas veces antes de decir "está en proceso".
const WAIT_MS = 3000;
const ATTEMPTS = 10;

// Lo que Mercado Pago agrega a la dirección al volver ("null" si el
// cliente volvió sin pagar). Solo sirve para no hacer esperar a quien ya
// sabemos que no pagó, y para no mostrarle un rechazo viejo a quien volvió
// aprobado: el pago aprobado lo confirma siempre el backend.
const UNPAID = ["rejected", "cancelled", "null"];

/**
 * A esta pantalla vuelve el cliente desde Mercado Pago (?pedido=<id>).
 * Muestra el estado del pago según el backend y, si no se pudo pagar,
 * deja reintentar.
 */
export default function PaymentResult(propsNavbar) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { recargar: recargarPedidos } = useOrders();
  const pedidoId = searchParams.get("pedido") || "";
  const estadoMP = searchParams.get("collection_status") || searchParams.get("status") || "";
  const pagoMP = searchParams.get("payment_id") || searchParams.get("collection_id") || "";

  // "consultando" | "aprobado" | "rechazado" | "en-proceso" | "error"
  const [estado, setEstado] = useState(pedidoId ? "consultando" : "error");
  const [error, setError] = useState(pedidoId ? "" : "No encontramos ese pedido.");
  const [reintentando, setReintentando] = useState(false);

  // Con el pago resuelto, el número de pedidos en curso de la barra se
  // actualiza (un pedido pagado sigue en curso; uno nuevo se suma).
  useEffect(() => {
    if (estado !== "consultando") recargarPedidos();
  }, [estado, recargarPedidos]);

  useEffect(() => {
    if (!pedidoId) return;

    // Al salir de la pantalla se corta la consulta: no se vuelve a preguntar
    // ni se cambia el estado. En desarrollo, StrictMode monta dos veces: la
    // primera vuelta se cancela y la segunda verifica de nuevo, sin problema
    // (el backend no aplica dos veces el mismo pago).
    let cancelado = false;
    let consultas = 0;
    let temporizador;
    const consultar = async () => {
      consultas += 1;
      try {
        const { estadoPago } = await getPurchaseDetail(pedidoId);
        if (cancelado) return;
        if (estadoPago === "approved" || estadoPago === null) {
          setEstado("aprobado");
        } else if (estadoMP !== "approved" && (estadoPago === "rejected" || UNPAID.includes(estadoMP))) {
          setEstado("rechazado");
        } else if (consultas < ATTEMPTS) {
          temporizador = setTimeout(consultar, WAIT_MS);
        } else {
          setEstado("en-proceso");
        }
      } catch (err) {
        if (cancelado) return;
        setEstado("error");
        setError(err.message);
      }
    };
    const empezar = async () => {
      // Primero se confirma el pago con el backend, sin esperar el aviso de
      // Mercado Pago. Si falla, el aviso queda de respaldo y se consulta igual.
      if (/^\d+$/.test(pagoMP)) {
        try {
          await verifyPayment(pedidoId, pagoMP);
        } catch {
          // Se sigue con la consulta de siempre.
        }
      }
      if (!cancelado) consultar();
    };
    empezar();
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [pedidoId, estadoMP, pagoMP]);

  const reintentar = async () => {
    setReintentando(true);
    setError("");
    try {
      goTo(await createPaymentLink(pedidoId));
    } catch (err) {
      setError(err.message);
      setReintentando(false);
    }
  };

  return (
    <AccountCard titulo={pedidoId ? `Pedido #${pedidoId}` : "Pago"} {...propsNavbar}>
      {estado === "consultando" && (
        <p role="status" className="mt-6 text-xs text-gray-500">
          Estamos confirmando tu pago...
        </p>
      )}

      {estado === "aprobado" && (
        <div role="status" className="mt-6 bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-xs font-semibold">
          ¡Pago aprobado! Tu compra está confirmada y te mandamos el detalle por mail.
        </div>
      )}

      {estado === "en-proceso" && (
        <div role="status" className="mt-6 bg-orange-50 border border-orange-200 text-orange-700 rounded-md px-4 py-3 text-xs font-semibold">
          Tu pago está en proceso. Cuando Mercado Pago lo apruebe, te avisamos por mail.
        </div>
      )}

      {estado === "rechazado" && (
        <>
          <div role="alert" className="mt-6 bg-red-50 border border-red-200 text-red-500 rounded-md px-4 py-3 text-xs font-semibold">
            El pago no se pudo completar. Tus repuestos siguen reservados: podés intentarlo de nuevo.
          </div>
          <button type="button" onClick={reintentar} disabled={reintentando} className={accountButtonClass}>
            {reintentando ? "Abriendo Mercado Pago..." : "Reintentar pago"}
          </button>
        </>
      )}

      {error && (
        <div role="alert" className="mt-6 bg-red-50 border border-red-200 text-red-500 rounded-md px-4 py-3 text-xs font-semibold">
          {error}
        </div>
      )}

      {estado !== "consultando" && (
        <button
          type="button"
          onClick={estado === "error" ? () => propsNavbar.onCatalogo() : () => navigate(`/pedidos/${pedidoId}`)}
          className="w-full mt-3 py-2 text-xs font-bold text-gray-500 hover:text-orange-500"
        >
          {estado === "error" ? "Ir a la tienda" : "Seguir mi pedido"}
        </button>
      )}
    </AccountCard>
  );
}
