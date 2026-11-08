// Aviso fijo abajo mientras el cliente no verificó su correo.

import { useEffect, useRef, useState } from "react";
import { getProfile, resendVerification } from "./api";

const SESSION_KEY = "autobought-sesion";
const CLOSED_KEY = "autobought-aviso-verificacion-cerrado";

function readClosed() {
  try {
    return sessionStorage.getItem(CLOSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Franja fija abajo de todo mientras el cliente no verificó su correo.
 * Sin verificar puede navegar, pero no confirmar compras. Solo se muestra
 * si el perfil dice explícitamente que no está verificado: una sesión sin
 * ese dato (perfil que no cargó) no muestra un aviso que puede ser falso.
 *
 * El enlace del mail suele abrirse en otra pestaña (o en otro dispositivo),
 * así que esta pestaña no se entera sola: se vuelve a preguntar al backend
 * al montar, al volver a la pestaña y cuando otra pestaña guarda la sesión
 * ya verificada. Si lo está, `onVerificado` saca el aviso.
 */
export default function VerifyEmailNotice({ sessionUser, onVerified }) {
  const [estado, setStatus] = useState("initial");
  const [error, setError] = useState("");
  const [isClosed, setIsClosed] = useState(readClosed);

  const pending = sessionUser?.verifiedEmail === false;
  const token = sessionUser?.token;

  // `onVerificado` cambia de identidad entre renders: se lee desde una ref
  // para no volver a registrar los listeners.
  const onVerifiedRef = useRef(onVerified);
  useEffect(() => {
    onVerifiedRef.current = onVerified;
  });

  useEffect(() => {
    if (!pending || !token) return;

    let cancelled = false;

    const consultar = () => {
      Promise.resolve()
        .then(() => getProfile(token))
        .then((profile) => {
          if (!cancelled && profile?.verifiedEmail) onVerifiedRef.current?.();
        })
        .catch(() => {});
    };

    const onGoBack = () => {
      if (document.visibilityState === "visible") consultar();
    };

    // Otra pestaña con la sesión en localStorage abrió el enlace y la
    // guardó verificada: no hace falta ir al backend.
    const onChangeStorage = (event) => {
      if (event.key !== SESSION_KEY || !event.newValue) return;
      try {
        if (JSON.parse(event.newValue)?.verifiedEmail) onVerifiedRef.current?.();
      } catch {
        // valor ilegible: se ignora
      }
    };

    consultar();
    window.addEventListener("focus", consultar);
    document.addEventListener("visibilitychange", onGoBack);
    window.addEventListener("storage", onChangeStorage);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", consultar);
      document.removeEventListener("visibilitychange", onGoBack);
      window.removeEventListener("storage", onChangeStorage);
    };
  }, [pending, token]);

  if (!pending || isClosed) return null;

  const reenviar = async () => {
    setStatus("sending");
    setError("");

    // El backend responde 204 aunque el correo ya esté verificado: antes de
    // decir "te lo reenviamos" se confirma que de verdad falte verificar.
    try {
      const profile = token ? await getProfile(token) : null;
      if (profile?.verifiedEmail) {
        onVerified?.();
        return;
      }
    } catch {
      // Sin perfil no se sabe: se reenvía igual.
    }

    try {
      await resendVerification();
      setStatus("shipped");
    } catch (err) {
      setStatus("initial");
      setError(err.message);
    }
  };

  const close = () => {
    setIsClosed(true);
    try {
      sessionStorage.setItem(CLOSED_KEY, "1");
    } catch {
      // sin storage, se cierra solo hasta recargar
    }
  };

  return (
    <div
      role="region"
      aria-label="Verificación del correo"
      className="fixed bottom-0 inset-x-0 z-50 bg-orange-500 text-white pl-4 pr-10 py-2 text-xs flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
    >
      <span>
        <strong>Verificá tu correo</strong> para poder confirmar compras. Te mandamos un enlace a {sessionUser.email}.
      </span>

      {estado === "shipped" ? (
        <span className="font-bold">Listo, te lo reenviamos.</span>
      ) : (
        <button
          type="button"
          onClick={reenviar}
          disabled={estado === "sending"}
          className="font-black underline hover:no-underline disabled:opacity-60"
        >
          {estado === "sending" ? "Enviando..." : "Reenviar mail"}
        </button>
      )}

      {error && <span className="font-bold">{error}</span>}

      <button
        type="button"
        onClick={close}
        aria-label="Cerrar aviso"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black leading-none hover:opacity-70"
      >
        ×
      </button>
    </div>
  );
}
