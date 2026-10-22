import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { darseDeBaja } from "./api";
import TarjetaCuenta, { claseBotonCuenta } from "./TarjetaCuenta";

const ENLACE_INVALIDO = "El enlace no es válido.";

/**
 * Enlace «No quiero recibir estos mails» de los mails comerciales
 * (?token=...). No pide sesión.
 */
export default function DarseDeBaja({ onIrALaTienda, ...propsNavbar }) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [estado, setEstado] = useState(token ? "procesando" : "error");
  const [error, setError] = useState(token ? "" : ENLACE_INVALIDO);

  // En desarrollo, StrictMode corre los efectos dos veces.
  const pedido = useRef(false);

  useEffect(() => {
    if (!token || pedido.current) return;
    pedido.current = true;

    darseDeBaja(token)
      .then(() => setEstado("listo"))
      .catch((err) => {
        setEstado("error");
        setError(err.message);
      });
  }, [token]);

  return (
    <TarjetaCuenta titulo="Mails de ofertas" {...propsNavbar}>
      {estado === "procesando" && (
        <p role="status" className="mt-6 text-[10px] text-gray-500">
          Procesando tu baja...
        </p>
      )}

      {estado === "listo" && (
        <div role="status" className="mt-6 bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-[10px] font-semibold">
          Listo, no te vamos a mandar más ofertas ni recordatorios. Los mails de tus pedidos y de tu cuenta te siguen llegando.
          Si cambiás de idea, lo podés volver a activar desde tu perfil.
        </div>
      )}

      {estado === "error" && (
        <div role="alert" className="mt-6 bg-red-50 border border-red-200 text-red-500 rounded-md px-4 py-3 text-[9px] font-semibold">
          {error} También podés dejar de recibirlos desde tu perfil.
        </div>
      )}

      {estado !== "procesando" && (
        <button type="button" onClick={onIrALaTienda} className={claseBotonCuenta}>
          IR A LA TIENDA
        </button>
      )}
    </TarjetaCuenta>
  );
}
