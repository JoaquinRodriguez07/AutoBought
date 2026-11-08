// Pantalla para cambiar la contraseña desde «Seguridad».

import { useState } from "react";
import { changePassword } from "./api";
import { saveSession, getSession } from "./auth";
import FieldError from "./FieldError";
import AccountSection, { cancelButtonClass, saveButtonClass, sectionButtonClass } from "./AccountSection";
import { withError, errorProps } from "./fieldErrors";
import { validatePasswordChange } from "./validations";

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

  const handleCambio = (e) => {
    const { name, value } = e.target;
    setError("");
    setErrors((actuales) => ({ ...actuales, [name]: undefined }));
    setForm((current) => ({ ...current, [name]: value }));
  };

  const open = () => {
    setSuccess(false);
    setWithoutNewToken(false);
    setIsOpen(true);
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
      {(success || isOpen) && (
        <>
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
