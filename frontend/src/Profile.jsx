// Pantalla del perfil del cliente.

import { useEffect, useRef, useState } from "react";
import AccountLayout from "./AccountLayout";
import { updateProfile, getProfile } from "./api";
import AccountSection, { cancelButtonClass, saveButtonClass, sectionButtonClass } from "./AccountSection";
import { PHONE_MESSAGE, normalizeUyPhone } from "./phone";
import { clean, validatePersonName } from "./validations";

const fullName = (sessionUser) =>
  `${sessionUser.displayName || ""} ${sessionUser.lastName || ""}`.trim();

export default function Profile({
  sessionUser,
  onUpdateUser,
  favoritesQuantity = 0,
  // Navegación (Navbar y menú de la cuenta): la usa CuentaLayout.
  ...navigation
}) {
  // Los hooks van antes que cualquier `return` condicional (reglas de
  // hooks): si `usuario` es null, App.jsx ya evita montar este
  // componente (`usuario ? <Perfil .../> : null`), así que estos
  // valores por defecto de `useState` nunca llegan a usarse de verdad.
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadNotice, setLoadNotice] = useState(false);
  const huboCambiosLocales = useRef(false);

  const [info, setData] = useState({
    displayName: fullName(sessionUser),
    lastName: "",
    email: sessionUser.email || "",
    phone: sessionUser.phone || "",
  });

  // Si cambia el usuario (ej. se renovó la sesión) mientras se edita, no se
  // pisa lo que el cliente está escribiendo.
  useEffect(() => {
    if (editing) return;
    setData({
      displayName: fullName(sessionUser),
      lastName: "",
      email: sessionUser.email || "",
      phone: sessionUser.phone || "",
    });
  }, [sessionUser, editing]);

  useEffect(() => {
    if (!sessionUser?.token) return;

    let unmounted = false;
    getProfile(sessionUser.token)
      .then((profile) => {
        if (unmounted || huboCambiosLocales.current) return;
        onUpdateUser?.({ ...sessionUser, ...profile });
      })
      .catch(() => {
        if (!unmounted) setLoadNotice(true);
      });

    return () => {
      unmounted = true;
    };
    // Solo al entrar al perfil: trae los datos frescos una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!sessionUser) {
    return null;
  }

  const startEdit = () => {
    huboCambiosLocales.current = true;
    setEditing(true);
  };

  const changeDato = (field, rawValue) => {
    setError("");
    setData((current) => ({
      ...current,
      [field]: rawValue,
    }));
  };

  const cancelEdit = () => {
    setData({
      displayName: fullName(sessionUser),
      lastName: "",
      email: sessionUser.email || "",
      phone: sessionUser.phone || "",
    });

    setError("");
    setEditing(false);
  };

  const saveCambios = async () => {
    // El teléfono se puede cambiar pero no borrar.
    const dataError =
      validatePersonName(info.displayName) ||
      (!clean(info.phone)
        ? "Ingresá tu teléfono."
        : normalizeUyPhone(info.phone)
          ? null
          : PHONE_MESSAGE);
    if (dataError) {
      setError(dataError);
      return;
    }

    setSaving(true);
    setError("");

    try {
      const profile = await updateProfile(info);
      onUpdateUser?.({ ...sessionUser, ...profile });
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full mt-2 h-11 px-4 bg-white border border-gray-200 rounded-md text-sm text-gray-900 outline-hidden focus:border-orange-500 transition";

  const row = (label, rawValue) => (
    <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-1 py-3 first:pt-0 last:pb-0">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 min-w-0 break-words">{rawValue}</dd>
    </div>
  );

  const emailLabel =
    sessionUser.verifiedEmail === true ? (
      <span className="ml-2 align-middle inline-block rounded-full px-2 py-0.5 text-xs font-bold bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">
        Verificado
      </span>
    ) : sessionUser.verifiedEmail === false ? (
      <span className="ml-2 align-middle inline-block rounded-full px-2 py-0.5 text-xs font-bold bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200">
        Sin verificar
      </span>
    ) : null;

  return (
    <AccountLayout
      {...navigation}
      sessionUser={sessionUser}
      favoritesQuantity={favoritesQuantity}
      section="info"
      title="Mis datos"
      description="Los usamos para contactarte por tus pedidos."
    >
      <div className="space-y-6">

        {loadNotice && (
          <p className="bg-white border border-gray-200 rounded-md px-4 py-3 text-sm text-gray-600">
            No pudimos actualizar tus datos, puede que no estén al día.
          </p>
        )}

        {/* DATOS PERSONALES */}

        <AccountSection
          title="Datos personales"
          titleId="titulo-datos-personales"
          action={
            !editing && (
              <button type="button" onClick={startEdit} className={sectionButtonClass}>
                Editar
              </button>
            )
          }
        >
          {editing ? (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                <div className="md:col-span-2">
                  <label htmlFor="perfil-nombre" className="text-xs font-bold text-gray-500">
                    NOMBRE COMPLETO
                  </label>
                  <input
                    id="perfil-nombre"
                    type="text"
                    autoComplete="name"
                    value={info.displayName}
                    onChange={(e) => changeDato("displayName", e.target.value)}
                    maxLength={120}
                    className={inputClass}
                  />
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-500">CORREO ELECTRÓNICO</p>
                  <p className="mt-2 h-11 px-4 flex items-center bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-500">
                    {sessionUser.email || "No especificado"}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">El correo no se puede cambiar.</p>
                </div>

                <div>
                  <label htmlFor="perfil-telefono" className="text-xs font-bold text-gray-500">
                    TELÉFONO
                  </label>
                  <input
                    id="perfil-telefono"
                    type="tel"
                    autoComplete="tel"
                    value={info.phone}
                    onChange={(e) => changeDato("phone", e.target.value)}
                    placeholder="Ej. 099 123 456"
                    className={inputClass}
                  />
                </div>

              </div>

              {error && (
                <p role="alert" className="text-red-600 text-sm mt-5">{error}</p>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={cancelEdit} className={cancelButtonClass}>
                  Cancelar
                </button>
                <button type="button" onClick={saveCambios} disabled={saving} className={saveButtonClass}>
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </div>
          ) : (
            <dl className="divide-y divide-gray-100">
              {row("Nombre completo", fullName(sessionUser) || "No especificado")}
              {row(
                "Correo electrónico",
                <>
                  {sessionUser.email || "No especificado"}
                  {emailLabel}
                </>
              )}
              {row("Teléfono", sessionUser.phone || "No especificado")}
            </dl>
          )}
        </AccountSection>

      </div>
    </AccountLayout>
  );
}
