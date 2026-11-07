// Pantalla para elegir una contraseña nueva desde el enlace del mail.

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { resetPassword } from "./api";
import FieldError from "./FieldError";
import { withError, errorProps } from "./fieldErrors";
import AccountCard, {
  accountButtonClass,
  accountLinkClass,
  accountInputClass,
} from "./AccountCard";
import { validateNewPassword } from "./validations";

const INVALID_LINK = "El enlace no es válido o ya venció. Pedí uno nuevo.";

/** Se abre desde el enlace del mail de recuperación (?token=...). */
export default function ResetPassword({
  onIniciarSesion,
  onPedirOtroEnlace,
  ...propsNavbar
}) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [formulario, setFormulario] = useState({ nueva: "", repetir: "" });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(token ? "" : INVALID_LINK);
  const [enlaceInvalido, setEnlaceInvalido] = useState(!token);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);

  const manejarCambio = (e) => {
    const { name, value } = e.target;
    setErrores((actuales) => ({ ...actuales, [name]: undefined }));
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  const guardar = async (e) => {
    e.preventDefault();

    const erroresFormulario = validateNewPassword(formulario);
    setErrores(erroresFormulario);
    if (Object.keys(erroresFormulario).length > 0) return;

    setGuardando(true);
    setError("");

    try {
      await resetPassword(token, formulario.nueva);
      setListo(true);
    } catch (err) {
      // 400 = el enlace ya se usó o venció; 422 = la contraseña no sirve
      // (ej: contiene el correo) y se puede corregir sin pedir otro.
      if (err.status === 400) setEnlaceInvalido(true);
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  if (listo) {
    return (
      <AccountCard titulo="Contraseña actualizada" {...propsNavbar}>
        <div role="status" className="mt-6 bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-xs font-semibold">
          Listo, ya podés iniciar sesión con tu contraseña nueva.
        </div>
        <button type="button" onClick={onIniciarSesion} className={accountButtonClass}>
          Iniciar sesión
        </button>
      </AccountCard>
    );
  }

  return (
    <AccountCard
      titulo="Contraseña nueva"
      subtitulo="Mínimo 8 caracteres, con al menos una letra y un número."
      {...propsNavbar}
    >
      {error && (
        <div role="alert" className="mt-6 bg-red-50 border border-red-200 text-red-500 rounded-md px-4 py-3 text-xs font-semibold">
          {error}
        </div>
      )}

      {enlaceInvalido ? (
        <button type="button" onClick={onPedirOtroEnlace} className={accountButtonClass}>
          Pedir otro enlace
        </button>
      ) : (
        <form onSubmit={guardar} noValidate className="mt-6">

          <label htmlFor="restablecer-nueva" className="text-xs font-bold text-gray-700">
            NUEVA CONTRASEÑA
          </label>
          <input
            id="restablecer-nueva"
            type="password"
            name="nueva"
            autoComplete="new-password"
            value={formulario.nueva}
            onChange={manejarCambio}
            className={withError(accountInputClass, errores.nueva)}
            {...errorProps("nueva", errores.nueva)}
          />
          <FieldError campo="nueva" mensaje={errores.nueva} />

          <label htmlFor="restablecer-repetir" className="block mt-5 text-xs font-bold text-gray-700">
            REPETIR NUEVA CONTRASEÑA
          </label>
          <input
            id="restablecer-repetir"
            type="password"
            name="repetir"
            autoComplete="new-password"
            value={formulario.repetir}
            onChange={manejarCambio}
            className={withError(accountInputClass, errores.repetir)}
            {...errorProps("repetir", errores.repetir)}
          />
          <FieldError campo="repetir" mensaje={errores.repetir} />

          <button type="submit" disabled={guardando} className={accountButtonClass}>
            {guardando ? "Guardando..." : "Guardar contraseña"}
          </button>

        </form>
      )}

      <p className="text-center text-xs text-gray-500 mt-6">
        <button type="button" onClick={onIniciarSesion} className={accountLinkClass}>
          Volver a iniciar sesión
        </button>
      </p>
    </AccountCard>
  );
}
