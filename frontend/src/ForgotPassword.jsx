// Pantalla para pedir el enlace de recuperación de la contraseña.

import { useState } from "react";
import { requestPasswordReset } from "./api";
import FieldError from "./FieldError";
import { withError, errorProps } from "./fieldErrors";
import AccountCard, {
  accountButtonClass,
  accountLinkClass,
  accountInputClass,
} from "./AccountCard";
import { validateEmail } from "./validations";

// Mismo texto que el backend: se muestra igual exista o no el correo.
const SENT_MESSAGE =
  "Si el correo está registrado, te mandamos un enlace para elegir una contraseña nueva.";

export default function ForgotPassword({ onVolverAlLogin, ...propsNavbar }) {
  const [email, setEmail] = useState("");
  const [errorEmail, setErrorEmail] = useState(null);
  const [error, setError] = useState("");
  const [enviado, setEnviado] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();

    const errorValidacion = validateEmail(email);
    setErrorEmail(errorValidacion);
    if (errorValidacion) return;

    setEnviando(true);
    setError("");

    try {
      setEnviado((await requestPasswordReset(email.trim())) || SENT_MESSAGE);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AccountCard
      titulo="Recuperar contraseña"
      subtitulo="Te mandamos un enlace a tu correo para elegir una contraseña nueva."
      {...propsNavbar}
    >
      {enviado ? (
        <div role="status" className="mt-6 bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-xs font-semibold">
          {enviado} Revisá también la carpeta de spam.
        </div>
      ) : (
        <form onSubmit={enviar} noValidate className="mt-6">

          {error && (
            <div role="alert" className="mb-5 bg-red-50 border border-red-200 text-red-500 rounded-md px-4 py-3 text-xs font-semibold">
              {error}
            </div>
          )}

          <label htmlFor="recuperar-email" className="text-xs font-bold text-gray-700">
            CORREO ELECTRÓNICO
          </label>
          <input
            id="recuperar-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrorEmail(null);
            }}
            placeholder="tu@email.com"
            className={withError(accountInputClass, errorEmail)}
            {...errorProps("email", errorEmail)}
          />
          <FieldError campo="email" mensaje={errorEmail} />

          <button type="submit" disabled={enviando} className={accountButtonClass}>
            {enviando ? "Enviando..." : "Enviar enlace"}
          </button>

        </form>
      )}

      <p className="text-center text-xs text-gray-500 mt-6">
        <button type="button" onClick={onVolverAlLogin} className={accountLinkClass}>
          Volver a iniciar sesión
        </button>
      </p>
    </AccountCard>
  );
}
