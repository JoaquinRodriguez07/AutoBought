import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { verificarCorreo } from "./api";
import TarjetaCuenta, { claseBotonCuenta } from "./TarjetaCuenta";

const ENLACE_INVALIDO = "El enlace no es válido o ya venció. Pedí uno nuevo.";

/**
 * Se abre desde el enlace del mail de verificación (?token=...). No pide
 * sesión: el mail se puede abrir en otro dispositivo.
 */
export default function VerificarCorreo({ onVerificado, onIrALaTienda, ...propsNavbar }) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [estado, setEstado] = useState(token ? "verificando" : "error");
  const [error, setError] = useState(token ? "" : ENLACE_INVALIDO);

  // En desarrollo, StrictMode corre los efectos dos veces: con esto el
  // pedido sale una sola vez.
  const pedido = useRef(false);

  useEffect(() => {
    if (!token || pedido.current) return;
    pedido.current = true;

    verificarCorreo(token)
      .then(() => {
        setEstado("listo");
        onVerificado?.();
      })
      .catch((err) => {
        setEstado("error");
        setError(err.message);
      });
  }, [token, onVerificado]);

  return (
    <TarjetaCuenta titulo="Verificar correo" {...propsNavbar}>
      {estado === "verificando" && (
        <p role="status" className="mt-6 text-[10px] text-gray-500">
          Verificando tu correo...
        </p>
      )}

      {estado === "listo" && (
        <div role="status" className="mt-6 bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-[10px] font-semibold">
          ¡Listo! Tu correo quedó verificado y ya podés confirmar compras.
        </div>
      )}

      {estado === "error" && (
        <div role="alert" className="mt-6 bg-red-50 border border-red-200 text-red-500 rounded-md px-4 py-3 text-[9px] font-semibold">
          {error} Con la sesión iniciada, podés reenviarlo desde el aviso de abajo.
        </div>
      )}

      {estado !== "verificando" && (
        <button type="button" onClick={onIrALaTienda} className={claseBotonCuenta}>
          IR A LA TIENDA
        </button>
      )}
    </TarjetaCuenta>
  );
}
