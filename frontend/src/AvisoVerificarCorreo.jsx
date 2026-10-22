import { useState } from "react";
import { reenviarVerificacion } from "./api";

/**
 * Franja fija arriba de todo mientras el cliente no verificó su correo.
 * Sin verificar puede navegar, pero no confirmar compras. Solo se muestra
 * si el perfil dice explícitamente que no está verificado: una sesión sin
 * ese dato (perfil que no cargó) no muestra un aviso que puede ser falso.
 */
export default function AvisoVerificarCorreo({ usuario }) {
  const [estado, setEstado] = useState("inicial");
  const [error, setError] = useState("");

  if (usuario?.emailVerificado !== false) return null;

  const reenviar = async () => {
    setEstado("enviando");
    setError("");

    try {
      await reenviarVerificacion();
      setEstado("enviado");
    } catch (err) {
      setEstado("inicial");
      setError(err.message);
    }
  };

  return (
    <div
      role="region"
      aria-label="Verificación del correo"
      className="fixed bottom-0 inset-x-0 z-50 bg-orange-500 text-white px-4 py-2 text-[10px] flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
    >
      <span>
        <strong>Verificá tu correo</strong> para poder confirmar compras. Te mandamos un enlace a {usuario.email}.
      </span>

      {estado === "enviado" ? (
        <span className="font-bold">Listo, te lo reenviamos.</span>
      ) : (
        <button
          type="button"
          onClick={reenviar}
          disabled={estado === "enviando"}
          className="font-black underline hover:no-underline disabled:opacity-60"
        >
          {estado === "enviando" ? "ENVIANDO..." : "REENVIAR MAIL"}
        </button>
      )}

      {error && <span className="font-bold">{error}</span>}
    </div>
  );
}
