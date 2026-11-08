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
  const { reload: reloadOrders } = useOrders();
  const idOrder = searchParams.get("pedido") || "";
  const statusMP = searchParams.get("collection_status") || searchParams.get("status") || "";
  const paymentMP = searchParams.get("payment_id") || searchParams.get("collection_id") || "";

  // "consultando" | "aprobado" | "rechazado" | "en-proceso" | "error"
  const [estado, setStatus] = useState(idOrder ? "consultando" : "error");
  const [error, setError] = useState(idOrder ? "" : "No encontramos ese pedido.");
  const [retrying, setRetrying] = useState(false);

  // Con el pago resuelto, el número de pedidos en curso de la barra se
  // actualiza (un pedido pagado sigue en curso; uno nuevo se suma).
  useEffect(() => {
    if (estado !== "consultando") reloadOrders();
  }, [estado, reloadOrders]);

  useEffect(() => {
    if (!idOrder) return;

    // Al salir de la pantalla se corta la consulta: no se vuelve a preguntar
    // ni se cambia el estado. En desarrollo, StrictMode monta dos veces: la
    // primera vuelta se cancela y la segunda verifica de nuevo, sin problema
    // (el backend no aplica dos veces el mismo pago).
    let cancelled = false;
    let queries = 0;
    let temporizador;
    const consultar = async () => {
      queries += 1;
      try {
        const { paymentStatus } = await getPurchaseDetail(idOrder);
        if (cancelled) return;
        if (paymentStatus === "approved" || paymentStatus === null) {
          setStatus("aprobado");
        } else if (statusMP !== "approved" && (paymentStatus === "rejected" || UNPAID.includes(statusMP))) {
          setStatus("rechazado");
        } else if (queries < ATTEMPTS) {
          temporizador = setTimeout(consultar, WAIT_MS);
        } else {
          setStatus("en-proceso");
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err.message);
      }
    };
    const empezar = async () => {
      // Primero se confirma el pago con el backend, sin esperar el aviso de
      // Mercado Pago. Si falla, el aviso queda de respaldo y se consulta igual.
      if (/^\d+$/.test(paymentMP)) {
        try {
          await verifyPayment(idOrder, paymentMP);
        } catch {
          // Se sigue con la consulta de siempre.
        }
      }
      if (!cancelled) void consultar();
    };
    void empezar();
    return () => {
      cancelled = true;
      clearTimeout(temporizador);
    };
  }, [idOrder, statusMP, paymentMP]);

  const retry = async () => {
    setRetrying(true);
    setError("");
    try {
      goTo(await createPaymentLink(idOrder));
    } catch (err) {
      setError(err.message);
      setRetrying(false);
    }
  };

  return (
    <AccountCard title={idOrder ? `Pedido #${idOrder}` : "Pago"} {...propsNavbar}>
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
          <button type="button" onClick={retry} disabled={retrying} className={accountButtonClass}>
            {retrying ? "Abriendo Mercado Pago..." : "Reintentar pago"}
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
          onClick={estado === "error" ? () => propsNavbar.onCatalogo() : () => navigate(`/pedidos/${idOrder}`)}
          className="w-full mt-3 py-2 text-xs font-bold text-gray-500 hover:text-orange-500"
        >
          {estado === "error" ? "Ir a la tienda" : "Seguir mi pedido"}
        </button>
      )}
    </AccountCard>
  );
}
