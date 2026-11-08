// Pantalla del enlace de verificación del correo.

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { verifyEmail } from "./api";
import AccountCard, { accountButtonClass } from "./AccountCard";

const INVALID_LINK = "El enlace no es válido o ya venció. Pedí uno nuevo.";

/**
 * Se abre desde el enlace del mail de verificación (?token=...). No pide
 * sesión: el mail se puede abrir en otro dispositivo.
 */
export default function VerifyEmail({ onVerified, onGoToStore, ...propsNavbar }) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [estado, setStatus] = useState(token ? "verificando" : "error");
  const [error, setError] = useState(token ? "" : INVALID_LINK);

  // En desarrollo, StrictMode corre los efectos dos veces: con esto el
  // pedido sale una sola vez.
  const pedido = useRef(false);

  useEffect(() => {
    if (!token || pedido.current) return;
    pedido.current = true;

    verifyEmail(token)
      .then(() => {
        setStatus("ready");
        onVerified?.();
      })
      .catch((err) => {
        setStatus("error");
        setError(err.message);
      });
  }, [token, onVerified]);

  return (
    <AccountCard title="Verificar correo" {...propsNavbar}>
      {estado === "verificando" && (
        <p role="status" className="mt-6 text-xs text-gray-500">
          Verificando tu correo...
        </p>
      )}

      {estado === "ready" && (
        <div role="status" className="mt-6 bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-xs font-semibold">
          ¡Listo! Tu correo quedó verificado y ya podés confirmar compras.
        </div>
      )}

      {estado === "error" && (
        <div role="alert" className="mt-6 bg-red-50 border border-red-200 text-red-500 rounded-md px-4 py-3 text-xs font-semibold">
          {error} Con la sesión iniciada, podés reenviarlo desde el aviso de abajo.
        </div>
      )}

      {estado !== "verificando" && (
        <button type="button" onClick={onGoToStore} className={accountButtonClass}>
          Ir a la tienda
        </button>
      )}
    </AccountCard>
  );
}
