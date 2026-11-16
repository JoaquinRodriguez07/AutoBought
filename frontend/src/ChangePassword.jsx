// Pantalla para cambiar la contraseña desde «Seguridad».

import { useState } from "react";
import { changePassword, requestPasswordReset } from "./api";
import { saveSession, getSession } from "./auth";
import FieldError from "./FieldError";
import AccountSection, { cancelButtonClass, saveButtonClass, sectionButtonClass } from "./AccountSection";
import { withError, errorProps } from "./fieldErrors";
import { validatePasswordChange } from "./validations";
import { EnvelopeIcon } from "./Icons";

const EMPTY_FORM = { current: "", newPassword: "", repeat: "" };

const inputClass =
  "w-full mt-2 h-11 px-4 bg-white border border-gray-200 rounded-md text-sm text-gray-700 outline-hidden focus:border-orange-500 transition";

export default function ChangePassword({ email = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(false);
  const [withoutNewToken, setWithoutNewToken] = useState(false);
  // "¿No la recordás?": el mismo enlace de «Recuperar contraseña», a su
  // propio correo (el de la sesión), sin tener que cerrar sesión.
  const [sendingLink, setSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const handleCambio = (e) => {
    const { name, value } = e.target;
    setError("");
    setErrors((actuales) => ({ ...actuales, [name]: undefined }));
    setForm((current) => ({ ...current, [name]: value }));
  };

  const open = () => {
    setSuccess(false);
    setWithoutNewToken(false);
    setLinkSent(false);
    setIsOpen(true);
  };

  const sendLink = async () => {
    setSendingLink(true);
    setError("");

    try {
      await requestPasswordReset(email);
      setForm(EMPTY_FORM);
      setErrors({});
      setIsOpen(false);
      setLinkSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingLink(false);
    }
  };

  const cancel = () => {
    setForm(EMPTY_FORM);
    setError("");
    setErrors({});
    setIsOpen(false);
  };

  const save = async (e) => {
    e.preventDefault();

    const errorsForm = validatePasswordChange(form, email);
    setErrors(errorsForm);
    if (Object.keys(errorsForm).length > 0) return;

    setSaving(true);
    setError("");

    try {
      const data = await changePassword(form.current, form.newPassword);

      // El backend invalidó todos los tokens anteriores, también el de esta
      // sesión: se guarda el nuevo ANTES de mostrar el éxito para que el
      // próximo pedido (y la renovación automática) ya use el válido.
      // Guardarlo actualiza el `usuario` de App (ver alGuardarSesion).
      const session = getSession();
      if (session && data?.access_token) {
        saveSession({
          ...session,
          token: data.access_token,
          ...(data.token_type ? { tokenType: data.token_type } : {}),
        });
        setWithoutNewToken(false);
      } else if (session) {
        // La contraseña se cambió pero no llegó un token nuevo: el actual
        // está revocado. No se muestra un éxito engañoso.
        setWithoutNewToken(true);
      }

      setForm(EMPTY_FORM);
      setIsOpen(false);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccountSection
      title="Contraseña"
      description="Cambiá la contraseña con la que iniciás sesión."
      titleId="titulo-contrasena"
      action={
        !isOpen && (
          <button type="button" onClick={open} className={sectionButtonClass}>
            Cambiar contraseña
          </button>
        )
      }
    >
      {(success || isOpen || linkSent) && (
        <>
          {linkSent && (
            <div role="status" className="flex items-start gap-4 rounded-lg border border-green-200 bg-green-50 px-5 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-green-600 shadow-xs">
                <EnvelopeIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-green-800">Revisá tu correo</p>
                <p className="mt-1 text-sm text-green-700">
                  Te mandamos un enlace a <span className="font-bold break-all">{email}</span> para
                  elegir una contraseña nueva. Si no lo ves, fijate en la carpeta de spam.
                </p>
                <p className="mt-2 text-xs text-green-700/80">
                  Cuando la cambies, vas a tener que volver a iniciar sesión.
                </p>
                <button
                  type="button"
                  onClick={sendLink}
                  disabled={sendingLink}
                  className="mt-3 text-xs font-bold text-green-800 underline underline-offset-4 hover:text-green-900 disabled:opacity-60"
                >
                  {sendingLink ? "Reenviando…" : "¿No te llegó? Reenviar enlace"}
                </button>
              </div>
            </div>
          )}

          {success && !withoutNewToken && (
            <p role="status" className="bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-sm">
              Tu contraseña se actualizó correctamente.
            </p>
          )}

          {success && withoutNewToken && (
            <p role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-4 py-3 text-sm">
              Tu contraseña se actualizó, pero tu sesión actual ya no es válida.
              Iniciá sesión de nuevo con la contraseña nueva.
            </p>
          )}

          {isOpen && (
            <form onSubmit={save}>

              <p className="text-xs text-gray-500 mb-4">
                Mínimo 8 caracteres, con al menos una letra y un número.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

                <div>
                  <label htmlFor="password-actual" className="text-xs font-bold text-gray-500">
                    CONTRASEÑA ACTUAL
                  </label>
                  <input
                    id="password-actual"
                    type="password"
                    name="current"
                    autoComplete="current-password"
                    value={form.current}
                    onChange={handleCambio}
                    className={withError(inputClass, errors.current)}
                    {...errorProps("current", errors.current)}
                  />
                  <FieldError field="current" message={errors.current} />
                </div>

                <div>
                  <label htmlFor="password-nueva" className="text-xs font-bold text-gray-500">
                    NUEVA CONTRASEÑA
                  </label>
                  <input
                    id="password-nueva"
                    type="password"
                    name="newPassword"
                    autoComplete="new-password"
                    value={form.newPassword}
                    onChange={handleCambio}
                    className={withError(inputClass, errors.newPassword)}
                    {...errorProps("newPassword", errors.newPassword)}
                  />
                  <FieldError field="newPassword" message={errors.newPassword} />
                </div>

                <div>
                  <label htmlFor="password-repetir" className="text-xs font-bold text-gray-500">
                    REPETIR NUEVA CONTRASEÑA
                  </label>
                  <input
                    id="password-repetir"
                    type="password"
                    name="repeat"
                    autoComplete="new-password"
                    value={form.repeat}
                    onChange={handleCambio}
                    className={withError(inputClass, errors.repeat)}
                    {...errorProps("repeat", errors.repeat)}
                  />
                  <FieldError field="repeat" message={errors.repeat} />
                </div>

              </div>

              {/* SIN LA CONTRASEÑA ACTUAL */}
              {/* El mismo enlace de «Recuperar contraseña», a su correo. */}

              {email && (
                <div className="mt-6 flex flex-col gap-4 rounded-lg border border-gray-200 bg-gray-50 px-5 py-4 sm:flex-row sm:items-center">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-500">
                    <EnvelopeIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-800">¿No recordás tu contraseña actual?</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Te mandamos un enlace a <span className="font-semibold text-gray-700 break-all">{email}</span> para
                      que elijas una nueva sin escribir la actual.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={sendLink}
                    disabled={sendingLink}
                    className="h-9 shrink-0 self-start rounded-md border border-orange-500 px-4 text-xs font-bold text-orange-500 transition hover:bg-orange-500 hover:text-white disabled:opacity-60 sm:self-auto"
                  >
                    {sendingLink ? "Enviando…" : "Enviar enlace"}
                  </button>
                </div>
              )}

              {error && (
                <p role="alert" className="text-red-600 text-sm mt-4">{error}</p>
              )}

              <div className="flex justify-end gap-3 mt-6">

                <button
                  type="button"
                  onClick={cancel}
                  className={cancelButtonClass}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className={saveButtonClass}
                >
                  {saving ? "Guardando..." : "Guardar contraseña"}
                </button>

              </div>

            </form>
          )}
        </>
      )}
    </AccountSection>
  );
}
