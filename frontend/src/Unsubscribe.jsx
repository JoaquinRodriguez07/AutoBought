// Pantalla del enlace «No quiero recibir estos mails».

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { unsubscribe } from "./api";
import AccountCard, { accountButtonClass } from "./AccountCard";

const INVALID_LINK = "El enlace no es válido.";

/**
 * Enlace «No quiero recibir estos mails» de los mails comerciales
 * (?token=...). No pide sesión.
 */
export default function Unsubscribe({ onGoToStore, ...propsNavbar }) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [estado, setStatus] = useState(token ? "procesando" : "error");
  const [error, setError] = useState(token ? "" : INVALID_LINK);

  // En desarrollo, StrictMode corre los efectos dos veces.
  const pedido = useRef(false);

  useEffect(() => {
    if (!token || pedido.current) return;
    pedido.current = true;

    unsubscribe(token)
      .then(() => setStatus("ready"))
      .catch((err) => {
        setStatus("error");
        setError(err.message);
      });
  }, [token]);

  return (
    <AccountCard title="Mails de ofertas" {...propsNavbar}>
      {estado === "procesando" && (
        <p role="status" className="mt-6 text-xs text-gray-500">
          Procesando tu baja...
        </p>
      )}

      {estado === "ready" && (
        <div role="status" className="mt-6 bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-xs font-semibold">
          Listo, no te vamos a mandar más ofertas ni recordatorios. Los mails de tus pedidos y de tu cuenta te siguen llegando.
          Si cambiás de idea, lo podés volver a activar desde tu perfil.
        </div>
      )}

      {estado === "error" && (
        <div role="alert" className="mt-6 bg-red-50 border border-red-200 text-red-500 rounded-md px-4 py-3 text-xs font-semibold">
          {error} También podés dejar de recibirlos desde tu perfil.
        </div>
      )}

      {estado !== "procesando" && (
        <button type="button" onClick={onGoToStore} className={accountButtonClass}>
          Ir a la tienda
        </button>
      )}
    </AccountCard>
  );
}
