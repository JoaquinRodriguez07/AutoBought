import { useEffect, useRef, useState } from "react";
import { obtenerPerfil, reenviarVerificacion } from "./api";

const SESION_KEY = "autobought-sesion";
const CERRADO_KEY = "autobought-aviso-verificacion-cerrado";

function leerCerrado() {
  try {
    return sessionStorage.getItem(CERRADO_KEY) === "1";
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
export default function AvisoVerificarCorreo({ usuario, onVerificado }) {
  const [estado, setEstado] = useState("inicial");
  const [error, setError] = useState("");
  const [cerrado, setCerrado] = useState(leerCerrado);

  const pendiente = usuario?.emailVerificado === false;
  const token = usuario?.token;

  // `onVerificado` cambia de identidad entre renders: se lee desde una ref
  // para no volver a registrar los listeners.
  const onVerificadoRef = useRef(onVerificado);
  useEffect(() => {
    onVerificadoRef.current = onVerificado;
  });

  useEffect(() => {
    if (!pendiente || !token) return;

    let cancelado = false;

    const consultar = () => {
      Promise.resolve()
        .then(() => obtenerPerfil(token))
        .then((perfil) => {
          if (!cancelado && perfil?.emailVerificado) onVerificadoRef.current?.();
        })
        .catch(() => {});
    };

    const alVolver = () => {
      if (document.visibilityState === "visible") consultar();
    };

    // Otra pestaña con la sesión en localStorage abrió el enlace y la
    // guardó verificada: no hace falta ir al backend.
    const alCambiarStorage = (event) => {
      if (event.key !== SESION_KEY || !event.newValue) return;
      try {
        if (JSON.parse(event.newValue)?.emailVerificado) onVerificadoRef.current?.();
      } catch {
        // valor ilegible: se ignora
      }
    };

    consultar();
    window.addEventListener("focus", consultar);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("storage", alCambiarStorage);

    return () => {
      cancelado = true;
      window.removeEventListener("focus", consultar);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("storage", alCambiarStorage);
    };
  }, [pendiente, token]);

  if (!pendiente || cerrado) return null;

  const reenviar = async () => {
    setEstado("enviando");
    setError("");

    // El backend responde 204 aunque el correo ya esté verificado: antes de
    // decir "te lo reenviamos" se confirma que de verdad falte verificar.
    try {
      const perfil = token ? await obtenerPerfil(token) : null;
      if (perfil?.emailVerificado) {
        onVerificado?.();
        return;
      }
    } catch {
      // Sin perfil no se sabe: se reenvía igual.
    }

    try {
      await reenviarVerificacion();
      setEstado("enviado");
    } catch (err) {
      setEstado("inicial");
      setError(err.message);
    }
  };

  const cerrar = () => {
    setCerrado(true);
    try {
      sessionStorage.setItem(CERRADO_KEY, "1");
    } catch {
      // sin storage, se cierra solo hasta recargar
    }
  };

  return (
    <div
      role="region"
      aria-label="Verificación del correo"
      className="fixed bottom-0 inset-x-0 z-50 bg-orange-500 text-white pl-4 pr-10 py-2 text-[10px] flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
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

      <button
        type="button"
        onClick={cerrar}
        aria-label="Cerrar aviso"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black leading-none hover:opacity-70"
      >
        ×
      </button>
    </div>
  );
}
