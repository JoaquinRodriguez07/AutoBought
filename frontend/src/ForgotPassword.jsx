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

export default function ForgotPassword({ onGoBackLogin, ...propsNavbar }) {
  const [email, setEmail] = useState("");
  const [errorEmail, setErrorEmail] = useState(null);
  const [error, setError] = useState("");
  const [shipped, setShipped] = useState("");
  const [sending, setSending] = useState(false);

  const send = async (e) => {
    e.preventDefault();

    const errorValidation = validateEmail(email);
    setErrorEmail(errorValidation);
    if (errorValidation) return;

    setSending(true);
    setError("");

    try {
      setShipped((await requestPasswordReset(email.trim())) || SENT_MESSAGE);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <AccountCard
      title="Recuperar contraseña"
      subtitulo="Te mandamos un enlace a tu correo para elegir una contraseña nueva."
      {...propsNavbar}
    >
      {shipped ? (
        <div role="status" className="mt-6 bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-xs font-semibold">
          {shipped} Revisá también la carpeta de spam.
        </div>
      ) : (
        <form onSubmit={send} noValidate className="mt-6">

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
          <FieldError field="email" message={errorEmail} />

          <button type="submit" disabled={sending} className={accountButtonClass}>
            {sending ? "Enviando..." : "Enviar enlace"}
          </button>

        </form>
      )}

      <p className="text-center text-xs text-gray-500 mt-6">
        <button type="button" onClick={onGoBackLogin} className={accountLinkClass}>
          Volver a iniciar sesión
        </button>
      </p>
    </AccountCard>
  );
}
