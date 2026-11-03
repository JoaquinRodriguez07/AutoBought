import { useEffect, useState } from "react";
import CuentaLayout from "./CuentaLayout";
import {
  obtenerDirecciones,
  crearDireccion,
  marcarDireccionPrincipal,
  eliminarDireccionAPI,
} from "./api";
import ErrorCampo from "./ErrorCampo";
import { IconoUbicacion } from "./Iconos";
import { claseBotonCancelar, claseBotonGuardar } from "./SeccionCuenta";
import { conError, propsError } from "./erroresCampo";
import { DEPARTAMENTOS, validarDireccion } from "./validaciones";

// Campos del backend → campos del formulario, para mostrar sus errores 422.
const CAMPOS_API = {
  personal_name: "nombre",
  street: "calle",
  number: "numero",
  apartment: "apartamento",
  city: "ciudad",
  department: "departamento",
  postal_code: "codigoPostal",
};

const claseInput =
  "w-full mt-2 h-11 px-4 bg-white border border-gray-200 rounded-md text-sm outline-hidden focus:border-orange-500";

const FORMULARIO_VACIO = {
  nombre: "",
  calle: "",
  numero: "",
  apartamento: "",
  ciudad: "",
  departamento: "",
  codigoPostal: "",
  principal: false,
};

export default function Direcciones(navegacion) {
  const [direcciones, setDirecciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);
  const [errores, setErrores] = useState({});
  const [errorFormulario, setErrorFormulario] = useState("");
  // Error de "eliminar" o "usar como principal": un aviso en la página.
  const [errorAccion, setErrorAccion] = useState("");
  // La dirección que pide confirmación antes de eliminarse.
  const [confirmandoId, setConfirmandoId] = useState(null);

  useEffect(() => {
    obtenerDirecciones()
      .then(setDirecciones)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  const manejarCambio = (e) => {
    const { name, value, type, checked } = e.target;

    setFormulario((actual) => ({
      ...actual,
      [name]: type === "checkbox" ? checked : value,
    }));
    // La ciudad también se valida contra el departamento.
    setErrores((actuales) => ({
      ...actuales,
      [name]: undefined,
      ...(name === "ciudad" ? { departamento: undefined } : {}),
    }));
    setErrorFormulario("");
  };

  const alternarFormulario = () => {
    setMostrarFormulario(!mostrarFormulario);
    setFormulario(FORMULARIO_VACIO);
    setErrores({});
    setErrorFormulario("");
  };

  const agregarDireccion = async (e) => {
    e.preventDefault();

    const erroresFormulario = validarDireccion(formulario);
    setErrores(erroresFormulario);
    if (Object.keys(erroresFormulario).length > 0) return;

    try {
      await crearDireccion(formulario);
      setDirecciones(await obtenerDirecciones());
      setError("");
      setFormulario(FORMULARIO_VACIO);
      setMostrarFormulario(false);
    } catch (err) {
      const campos = Object.fromEntries(
        Object.entries(err.campos || {})
          .filter(([campo]) => CAMPOS_API[campo])
          .map(([campo, mensaje]) => [CAMPOS_API[campo], mensaje])
      );
      if (Object.keys(campos).length > 0) setErrores(campos);
      else setErrorFormulario(err.message);
    }
  };

  // Eliminar y marcar como principal: si falla, un aviso arriba de la lista.
  const ejecutar = async (accion) => {
    setErrorAccion("");
    try {
      await accion();
      setDirecciones(await obtenerDirecciones());
    } catch (err) {
      // Un 401 ya lo manejó alSesionInvalida (cerró la sesión y fue a /login).
      if (err.status === 401) return;
      setErrorAccion(err.message);
    }
  };

  const eliminarDireccion = (id) => {
    setConfirmandoId(null);
    return ejecutar(() => eliminarDireccionAPI(id));
  };

  const marcarPrincipal = (id) => ejecutar(() => marcarDireccionPrincipal(id));

  // La principal, primero.
  const ordenadas = [...direcciones].sort((a, b) => Number(b.principal) - Number(a.principal));

  const campo = (nombre, etiqueta, clase, input) => (
    <div className={clase}>
      <label htmlFor={`direccion-${nombre}`} className="text-xs font-bold text-gray-500">
        {etiqueta}
      </label>
      {input}
      <ErrorCampo campo={nombre} mensaje={errores[nombre]} />
    </div>
  );

  const propsInput = (nombre) => ({
    id: `direccion-${nombre}`,
    name: nombre,
    value: formulario[nombre],
    onChange: manejarCambio,
    className: conError(claseInput, errores[nombre]),
    ...propsError(nombre, errores[nombre]),
  });

  const botonAgregar = (
    <button
      type="button"
      onClick={alternarFormulario}
      className="min-h-[180px] w-full border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-orange-300 hover:text-orange-600 transition"
    >
      <span aria-hidden="true" className="text-2xl leading-none">+</span>
      <span className="text-sm font-bold">Agregar dirección</span>
    </button>
  );

  return (
    <CuentaLayout
      {...navegacion}
      seccion="direcciones"
      titulo="Mis direcciones"
      descripcion="Las direcciones donde recibís tus compras."
    >

      {/* FORMULARIO */}

      {mostrarFormulario && (
        <form
          onSubmit={agregarDireccion}
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

            {campo("nombre", "NOMBRE DE LA DIRECCIÓN *", "md:col-span-3",
              <input {...propsInput("nombre")} placeholder="Ej: Casa" maxLength={50} />
            )}

            {campo("calle", "CALLE *", "md:col-span-4 md:col-start-1",
              <input {...propsInput("calle")} placeholder="Ej: Av. Italia" maxLength={50} autoComplete="address-line1" />
            )}

            {campo("numero", "NÚMERO *", "md:col-span-1",
              <input {...propsInput("numero")} placeholder="Ej: 1234 o S/N" maxLength={10} />
            )}

            {campo("apartamento", "APTO.", "md:col-span-1",
              <input {...propsInput("apartamento")} placeholder="Opcional" maxLength={10} autoComplete="address-line2" />
            )}

            {campo("ciudad", "CIUDAD *", "md:col-span-3",
              <input {...propsInput("ciudad")} placeholder="Ej: Montevideo" maxLength={50} autoComplete="address-level2" />
            )}

            {campo("departamento", "DEPARTAMENTO *", "md:col-span-3",
              <select {...propsInput("departamento")}>
                <option value="">Seleccioná un departamento</option>
                {DEPARTAMENTOS.map((departamento) => (
                  <option key={departamento} value={departamento}>
                    {departamento}
                  </option>
                ))}
              </select>
            )}

            {campo("codigoPostal", "CÓDIGO POSTAL", "md:col-span-2",
              <input
                {...propsInput("codigoPostal")}
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
                name="principal"
                checked={formulario.principal}
                onChange={manejarCambio}
                className="w-4 h-4 accent-orange-500"
              />
              Usar como dirección principal
            </label>

            {errorFormulario && (
              <p role="alert" className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-3 text-sm mt-5">
                {errorFormulario}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
            <button type="button" onClick={alternarFormulario} className={claseBotonCancelar}>
              CANCELAR
            </button>
            <button type="submit" className={claseBotonGuardar}>
              GUARDAR DIRECCIÓN
            </button>
          </div>
        </form>
      )}

      {errorAccion && (
        <p role="alert" className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-3 text-sm mb-6">
          {errorAccion}
        </p>
      )}

      {/* DIRECCIONES */}

      {cargando ? (

        <div role="status" className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <span className="sr-only">Cargando direcciones...</span>
          {[0, 1].map((i) => (
            <div key={i} aria-hidden="true" className="border border-gray-200 rounded-xl p-5 animate-pulse">
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

      ) : direcciones.length === 0 ? (

        mostrarFormulario ? null : (
          <div className="border border-dashed border-gray-200 rounded-xl text-center px-6 py-14">
            <IconoUbicacion className="w-10 h-10 mx-auto text-gray-300" />
            <p className="text-gray-700 text-sm font-bold mt-4">
              Todavía no tenés direcciones guardadas.
            </p>
            <p className="text-gray-500 text-sm mt-1">
              Agregá una dirección para utilizarla durante tus compras.
            </p>
            <button type="button" onClick={alternarFormulario} className={`${claseBotonGuardar} mt-6`}>
              + Agregar dirección
            </button>
          </div>
        )

      ) : (

        <ul aria-label="Direcciones guardadas" className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {ordenadas.map((direccion) => (
            <li
              key={direccion.id}
              className={`rounded-xl p-5 flex flex-col bg-white border ${
                direccion.principal ? "border-orange-200" : "border-gray-200"
              }`}
            >
              <div className="flex gap-3 flex-1">
                <span
                  aria-hidden="true"
                  className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${
                    direccion.principal ? "bg-orange-50 text-orange-500" : "bg-gray-50 text-gray-400"
                  }`}
                >
                  <IconoUbicacion className="w-5 h-5" />
                </span>

                <div className="min-w-0">
                  <h3 className="text-sm font-black text-gray-900 flex flex-wrap items-center gap-2">
                    {direccion.nombre}
                    {direccion.principal && (
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-bold bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200">
                        Principal
                      </span>
                    )}
                  </h3>

                  <p className="text-sm text-gray-700 mt-2">
                    {direccion.calle} {direccion.numero}
                    {direccion.apartamento && `, apto. ${direccion.apartamento}`}
                  </p>
                  <p className="text-sm text-gray-500">
                    {direccion.ciudad}, {direccion.departamento}
                    {direccion.codigoPostal && ` · CP ${direccion.codigoPostal}`}
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-100 mt-5 pt-3 min-h-[36px] flex items-center gap-4">
                {confirmandoId === direccion.id ? (
                  <>
                    <p className="text-sm text-gray-700 flex-1">¿Eliminar esta dirección?</p>
                    <button
                      type="button"
                      onClick={() => setConfirmandoId(null)}
                      className="text-xs font-bold text-gray-600 hover:text-gray-900"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminarDireccion(direccion.id)}
                      className="h-8 px-3 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-bold"
                    >
                      Sí, eliminar
                    </button>
                  </>
                ) : (
                  <>
                    {!direccion.principal && (
                      <button
                        type="button"
                        onClick={() => marcarPrincipal(direccion.id)}
                        className="text-xs font-bold text-gray-600 hover:text-orange-600"
                      >
                        Usar como principal
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirmandoId(direccion.id)}
                      aria-label={`Eliminar la dirección ${direccion.nombre}`}
                      className="ml-auto text-xs font-bold text-gray-500 hover:text-red-600"
                    >
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}

          {!mostrarFormulario && <li>{botonAgregar}</li>}

        </ul>

      )}

    </CuentaLayout>
  );
}
