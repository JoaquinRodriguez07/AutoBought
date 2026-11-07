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
  onStartSession,
  onAskOtherLink,
  ...propsNavbar
}) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [form, setForm] = useState({ newPassword: "", repeat: "" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(token ? "" : INVALID_LINK);
  const [invalidLink, setInvalidLink] = useState(!token);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  const handleCambio = (e) => {
    const { name, value } = e.target;
    setErrors((actuales) => ({ ...actuales, [name]: undefined }));
    setForm((current) => ({ ...current, [name]: value }));
  };

  const save = async (e) => {
    e.preventDefault();

    const errorsForm = validateNewPassword(form);
    setErrors(errorsForm);
    if (Object.keys(errorsForm).length > 0) return;

    setSaving(true);
    setError("");

    try {
      await resetPassword(token, form.newPassword);
      setReady(true);
    } catch (err) {
      // 400 = el enlace ya se usó o venció; 422 = la contraseña no sirve
      // (ej: contiene el correo) y se puede corregir sin pedir otro.
      if (err.status === 400) setInvalidLink(true);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (ready) {
    return (
      <AccountCard title="Contraseña actualizada" {...propsNavbar}>
        <div role="status" className="mt-6 bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-xs font-semibold">
          Listo, ya podés iniciar sesión con tu contraseña nueva.
        </div>
        <button type="button" onClick={onStartSession} className={accountButtonClass}>
          Iniciar sesión
        </button>
      </AccountCard>
    );
  }

  return (
    <AccountCard
      title="Contraseña nueva"
      subtitulo="Mínimo 8 caracteres, con al menos una letra y un número."
      {...propsNavbar}
    >
      {error && (
        <div role="alert" className="mt-6 bg-red-50 border border-red-200 text-red-500 rounded-md px-4 py-3 text-xs font-semibold">
          {error}
        </div>
      )}

      {invalidLink ? (
        <button type="button" onClick={onAskOtherLink} className={accountButtonClass}>
          Pedir otro enlace
        </button>
      ) : (
        <form onSubmit={save} noValidate className="mt-6">

          <label htmlFor="restablecer-nueva" className="text-xs font-bold text-gray-700">
            NUEVA CONTRASEÑA
          </label>
          <input
            id="restablecer-nueva"
            type="password"
            name="newPassword"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={handleCambio}
            className={withError(accountInputClass, errors.newPassword)}
            {...errorProps("newPassword", errors.newPassword)}
          />
          <FieldError field="newPassword" message={errors.newPassword} />

          <label htmlFor="restablecer-repetir" className="block mt-5 text-xs font-bold text-gray-700">
            REPETIR NUEVA CONTRASEÑA
          </label>
          <input
            id="restablecer-repetir"
            type="password"
            name="repeat"
            autoComplete="new-password"
            value={form.repeat}
            onChange={handleCambio}
            className={withError(accountInputClass, errors.repeat)}
            {...errorProps("repeat", errors.repeat)}
          />
          <FieldError field="repeat" message={errors.repeat} />

          <button type="submit" disabled={saving} className={accountButtonClass}>
            {saving ? "Guardando..." : "Guardar contraseña"}
          </button>

        </form>
      )}

      <p className="text-center text-xs text-gray-500 mt-6">
        <button type="button" onClick={onStartSession} className={accountLinkClass}>
          Volver a iniciar sesión
        </button>
      </p>
    </AccountCard>
  );
}
