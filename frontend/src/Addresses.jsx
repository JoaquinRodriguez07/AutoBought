// Pantalla de las direcciones de envío del cliente.

import { useEffect, useState } from "react";
import AccountLayout from "./AccountLayout";
import {
  getAddresses,
  createAddress,
  setPrimaryAddress,
  deleteAddressApi,
} from "./api";
import FieldError from "./FieldError";
import { LocationIcon } from "./Icons";
import { cancelButtonClass, saveButtonClass } from "./AccountSection";
import { withError, errorProps } from "./fieldErrors";
import { DEPARTMENTS, validateAddress } from "./validations";

// Campos del backend → campos del formulario, para mostrar sus errores 422.
const API_FIELDS = {
  personal_name: "displayName",
  street: "street",
  number: "number",
  apartment: "apartamento",
  city: "city",
  department: "departamento",
  postal_code: "codePostal",
};

const inputClass =
  "w-full mt-2 h-11 px-4 bg-white border border-gray-200 rounded-md text-sm outline-hidden focus:border-orange-500";

const EMPTY_FORM = {
  displayName: "",
  street: "",
  number: "",
  apartamento: "",
  city: "",
  departamento: "",
  codePostal: "",
  primary: false,
};

export default function Addresses(navigation) {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [errorForm, setErrorForm] = useState("");
  // Error de "eliminar" o "usar como principal": un aviso en la página.
  const [errorAction, setErrorAction] = useState("");
  // La dirección que pide confirmación antes de eliminarse.
  const [confirmingId, setConfirmingId] = useState(null);

  useEffect(() => {
    getAddresses()
      .then(setAddresses)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleCambio = (e) => {
    const { name, value, type, checked } = e.target;

    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
    // La ciudad también se valida contra el departamento.
    setErrors((actuales) => ({
      ...actuales,
      [name]: undefined,
      ...(name === "city" ? { departamento: undefined } : {}),
    }));
    setErrorForm("");
  };

  const toggleForm = () => {
    setShowForm(!showForm);
    setForm(EMPTY_FORM);
    setErrors({});
    setErrorForm("");
  };

  const addAddress = async (e) => {
    e.preventDefault();

    const errorsForm = validateAddress(form);
    setErrors(errorsForm);
    if (Object.keys(errorsForm).length > 0) return;

    try {
      await createAddress(form);
      setAddresses(await getAddresses());
      setError("");
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      const fields = Object.fromEntries(
        Object.entries(err.fields || {})
          .filter(([field]) => API_FIELDS[field])
          .map(([field, message]) => [API_FIELDS[field], message])
      );
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setErrorForm(err.message);
    }
  };

  // Eliminar y marcar como principal: si falla, un aviso arriba de la lista.
  const run = async (action) => {
    setErrorAction("");
    try {
      await action();
      setAddresses(await getAddresses());
    } catch (err) {
      // Un 401 ya lo manejó alSesionInvalida (cerró la sesión y fue a /login).
      if (err.status === 401) return;
      setErrorAction(err.message);
    }
  };

  const deleteAddress = (id) => {
    setConfirmingId(null);
    return run(() => deleteAddressApi(id));
  };

  const markPrimary = (id) => run(() => setPrimaryAddress(id));

  // La principal, primero.
  const ordenadas = [...addresses].sort((a, b) => Number(b.primary) - Number(a.primary));

  const field = (displayName, label, clase, input) => (
    <div className={clase}>
      <label htmlFor={`direccion-${displayName}`} className="text-xs font-bold text-gray-500">
        {label}
      </label>
      {input}
      <FieldError field={displayName} message={errors[displayName]} />
    </div>
  );

  const propsInput = (displayName) => ({
    id: `direccion-${displayName}`,
    name: displayName,
    value: form[displayName],
    onChange: handleCambio,
    className: withError(inputClass, errors[displayName]),
    ...errorProps(displayName, errors[displayName]),
  });

  const buttonAdd = (
    <button
      type="button"
      onClick={toggleForm}
      className="min-h-[180px] w-full bg-white border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-orange-300 hover:text-orange-600 transition"
    >
      <span aria-hidden="true" className="text-2xl leading-none">+</span>
      <span className="text-sm font-bold">Agregar dirección</span>
    </button>
  );

  return (
    <AccountLayout
      {...navigation}
      section="addresses"
      title="Mis direcciones"
      description="Las direcciones donde recibís tus compras."
    >

      {/* FORMULARIO */}

      {showForm && (
        <form
          onSubmit={addAddress}
          noValidate
          aria-labelledby="titulo-nueva-direccion"
          className="border border-gray-200 rounded-xl mb-8 bg-white"
        >
          <div className="px-6 py-5 border-b border-gray-100">
            <h3 id="titulo-nueva-direccion" className="text-base font-black text-gray-900">
              Nueva dirección
            </h3>
            <p className="text-sm text-gray-500 mt-1">Los campos con * son obligatorios.</p>
          </div>

          <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-6 gap-5">

            {field("displayName", "NOMBRE DE LA DIRECCIÓN *", "md:col-span-3",
              <input {...propsInput("displayName")} placeholder="Ej: Casa" maxLength={50} />
            )}

            {field("street", "CALLE *", "md:col-span-4 md:col-start-1",
              <input {...propsInput("street")} placeholder="Ej: Av. Italia" maxLength={50} autoComplete="address-line1" />
            )}

            {field("number", "NÚMERO *", "md:col-span-1",
              <input {...propsInput("number")} placeholder="Ej: 1234 o S/N" maxLength={10} />
            )}

            {field("apartamento", "APTO.", "md:col-span-1",
              <input {...propsInput("apartamento")} placeholder="Opcional" maxLength={10} autoComplete="address-line2" />
            )}

            {field("city", "CIUDAD *", "md:col-span-3",
              <input {...propsInput("city")} placeholder="Ej: Montevideo" maxLength={50} autoComplete="address-level2" />
            )}

            {field("departamento", "DEPARTAMENTO *", "md:col-span-3",
              <select {...propsInput("departamento")}>
                <option value="">Seleccioná un departamento</option>
                {DEPARTMENTS.map((departamento) => (
                  <option key={departamento} value={departamento}>
                    {departamento}
                  </option>
                ))}
              </select>
            )}

            {field("codePostal", "CÓDIGO POSTAL", "md:col-span-2",
              <input
                {...propsInput("codePostal")}
                placeholder="Opcional (ej: 11300)"
                inputMode="numeric"
                maxLength={5}
                autoComplete="postal-code"
              />
            )}

          </div>

          <div className="px-6 pb-5">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                name="primary"
                checked={form.primary}
                onChange={handleCambio}
                className="w-4 h-4 accent-orange-500"
              />
              Usar como dirección principal
            </label>

            {errorForm && (
              <p role="alert" className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-3 text-sm mt-5">
                {errorForm}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
            <button type="button" onClick={toggleForm} className={cancelButtonClass}>
              Cancelar
            </button>
            <button type="submit" className={saveButtonClass}>
              Guardar dirección
            </button>
          </div>
        </form>
      )}

      {errorAction && (
        <p role="alert" className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-3 text-sm mb-6">
          {errorAction}
        </p>
      )}

      {/* DIRECCIONES */}

      {loading ? (

        <div role="status" className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <span className="sr-only">Cargando direcciones...</span>
          {[0, 1].map((i) => (
            <div key={i} aria-hidden="true" className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-gray-100 rounded" />
                  <div className="h-3 w-40 bg-gray-100 rounded" />
                  <div className="h-3 w-32 bg-gray-100 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>

      ) : error ? (

        <p role="alert" className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-3 text-sm">
          {error}
        </p>

      ) : addresses.length === 0 ? (

        showForm ? null : (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl text-center px-6 py-14">
            <LocationIcon className="w-10 h-10 mx-auto text-gray-300" />
            <p className="text-gray-700 text-sm font-bold mt-4">
              Todavía no tenés direcciones guardadas.
            </p>
            <p className="text-gray-500 text-sm mt-1">
              Agregá una dirección para utilizarla durante tus compras.
            </p>
            <button type="button" onClick={toggleForm} className={`${saveButtonClass} mt-6`}>
              + Agregar dirección
            </button>
          </div>
        )

      ) : (

        <ul aria-label="Direcciones guardadas" className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {ordenadas.map((shippingAddress) => (
            <li
              key={shippingAddress.id}
              className={`rounded-xl p-5 flex flex-col bg-white border ${
                shippingAddress.primary ? "border-orange-200" : "border-gray-200"
              }`}
            >
              <div className="flex gap-3 flex-1">
                <span
                  aria-hidden="true"
                  className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${
                    shippingAddress.primary ? "bg-orange-50 text-orange-500" : "bg-gray-50 text-gray-400"
                  }`}
                >
                  <LocationIcon className="w-5 h-5" />
                </span>

                <div className="min-w-0">
                  <h3 className="text-sm font-black text-gray-900 flex flex-wrap items-center gap-2">
                    {shippingAddress.displayName}
                    {shippingAddress.primary && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200">
                        Principal
                      </span>
                    )}
                  </h3>

                  <p className="text-sm text-gray-700 mt-2">
                    {shippingAddress.street} {shippingAddress.number}
                    {shippingAddress.apartamento && `, apto. ${shippingAddress.apartamento}`}
                  </p>
                  <p className="text-sm text-gray-500">
                    {shippingAddress.city}, {shippingAddress.departamento}
                    {shippingAddress.codePostal && ` · CP ${shippingAddress.codePostal}`}
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-100 mt-5 pt-3 min-h-[36px] flex items-center gap-4">
                {confirmingId === shippingAddress.id ? (
                  <>
                    <p className="text-sm text-gray-700 flex-1">¿Eliminar esta dirección?</p>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      className="text-xs font-bold text-gray-600 hover:text-gray-900"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteAddress(shippingAddress.id)}
                      className="h-8 px-3 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-bold"
                    >
                      Sí, eliminar
                    </button>
                  </>
                ) : (
                  <>
                    {!shippingAddress.primary && (
                      <button
                        type="button"
                        onClick={() => markPrimary(shippingAddress.id)}
                        className="text-xs font-bold text-gray-600 hover:text-orange-600"
                      >
                        Usar como principal
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirmingId(shippingAddress.id)}
                      aria-label={`Eliminar la dirección ${shippingAddress.displayName}`}
                      className="ml-auto text-xs font-bold text-gray-500 hover:text-red-600"
                    >
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}

          {!showForm && <li>{buttonAdd}</li>}

        </ul>

      )}

    </AccountLayout>
  );
}
