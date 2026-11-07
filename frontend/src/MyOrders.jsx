// «Mis compras › En curso»: los pedidos que todavía no terminaron.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { confirmReceipt, createPaymentLink, getPurchaseDetail, getPurchaseHistory } from "./api";
import { useOrders } from "./context/OrdersContext";
import AccountLayout from "./AccountLayout";
import OrderDetail from "./OrderDetail";
import { TruckIcon } from "./Icons";
import PurchaseTabs from "./PurchaseTabs";
import { goTo } from "./redirect";
import { isActive, formatDate } from "./orderTracking";
import ActiveOrderCard from "./ActiveOrderCard";

function Loading({ texto }) {
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
export default function MyOrders(propsNavbar) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { establecer } = useOrders();

  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [details, setDetail] = useState(null);
  const [detailError, setDetailError] = useState("");

  // El pedido con una acción en marcha (pagar o «Ya lo recibí»).
  const [payingId, setPayingId] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [deliveredId, setDeliveredId] = useState(null);
  const busy = payingId !== null || confirmingId !== null;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const list = await getPurchaseHistory();
        if (!cancelled) {
          setPurchases(list);
          establecer(list);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "No pudimos cargar tus pedidos.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [establecer]);

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;

    const load = async () => {
      setDetailError("");
      try {
        const pedido = await getPurchaseDetail(id);
        if (!cancelled) setDetail(pedido);
      } catch (loadError) {
        if (!cancelled) setDetailError(loadError.message || "No pudimos cargar el pedido.");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // El detalle cargado corresponde al pedido de la dirección.
  const selectedPurchase = id && details && String(details.id) === String(id) ? details : null;

  const reemplazar = (updated) => {
    const list = purchases.map((previous) => (previous.id === updated.id ? updated : previous));
    setPurchases(list);
    establecer(list);
  };

  const pay = async (purchase) => {
    setPayingId(purchase.id);
    setError("");
    try {
      goTo(await createPaymentLink(purchase.id));
    } catch (paymentError) {
      setError(paymentError.message || "No pudimos abrir Mercado Pago.");
      setPayingId(null);
    }
  };

  const confirmArrival = async (purchase) => {
    setConfirmingId(purchase.id);
    setError("");
    try {
      const delivered = await confirmReceipt(purchase.id);
      reemplazar(delivered);
      setDeliveredId(delivered.id);
    } catch (errorRecepcion) {
      setError(errorRecepcion.message || "No pudimos confirmar la llegada del pedido.");
    } finally {
      setConfirmingId(null);
    }
  };

  const inProgress = purchases.filter(isActive);

  return (
    <AccountLayout
      {...propsNavbar}
      section="purchases"
      migas={
        id
          ? [
              { texto: "Inicio", goTo: propsNavbar.onHome },
              { texto: "Mi cuenta", goTo: () => navigate("/cuenta") },
              { texto: "Mis compras", goTo: () => navigate("/pedidos") },
              `Pedido #${id}`,
            ]
          : undefined
      }
      title={id ? `Pedido #${id}` : "Mis compras"}
      description={id && selectedPurchase ? `Realizado el ${formatDate(selectedPurchase.date)}` : undefined}
    >
          {!id && <PurchaseTabs current="inProgress" />}

          {id ? (
            detailError ? (
              <>
                <p role="alert" className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-3 text-sm font-bold mb-6">
                  {detailError}
                </p>
                <button type="button" onClick={() => navigate("/pedidos")} className="text-orange-500 text-sm font-bold hover:underline">
                  ← Volver a mis compras
                </button>
              </>
            ) : selectedPurchase ? (
              <OrderDetail
                key={selectedPurchase.id}
                purchase={selectedPurchase}
                textGoBack="← Volver a mis compras"
                onGoBack={() => navigate("/pedidos")}
                onUpdated={(delivered) => {
                  setDetail(delivered);
                  reemplazar(delivered);
                }}
              />
            ) : (
              <Loading texto="Cargando el pedido..." />
            )
          ) : loading ? (
            <Loading texto="Cargando tus pedidos..." />
          ) : (
            <>
              {error && (
                <p role="alert" className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-3 text-sm font-bold mb-6">
                  {error}
                </p>
              )}

              {deliveredId !== null && (
                <p role="status" className="bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-sm font-bold mb-6">
                  ¡Listo! Marcamos el pedido #{deliveredId} como entregado. Te mandamos un mail con el resumen.
                  Lo vas a encontrar en «Anteriores».
                </p>
              )}

              {inProgress.length > 0 ? (
                <ul aria-label="Pedidos en curso" className="space-y-4">
                  {inProgress.map((purchase) => (
                    <ActiveOrderCard
                      key={purchase.id}
                      purchase={purchase}
                      onSeeDetail={(chosen) => navigate(`/pedidos/${chosen.id}`)}
                      onPay={pay}
                      onReceived={confirmArrival}
                      paying={payingId === purchase.id}
                      confirming={confirmingId === purchase.id}
                      busy={busy}
                    />
                  ))}
                </ul>
              ) : (
                !error && (
                  <div className="text-center py-16 bg-white border border-dashed border-gray-300 rounded-xl">
                    <TruckIcon className="w-10 h-10 mx-auto text-gray-300 mb-4" />
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
    </AccountLayout>
  );
}
