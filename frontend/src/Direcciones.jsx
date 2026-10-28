import { useEffect, useState } from "react";
import CuentaLayout from "./CuentaLayout";
import {
  obtenerDirecciones,
  crearDireccion,
  marcarDireccionPrincipal,
  eliminarDireccionAPI,
} from "./api";
import ErrorCampo from "./ErrorCampo";
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

  const eliminarDireccion = async (id) => {
    try {
      await eliminarDireccionAPI(id);
      setDirecciones(await obtenerDirecciones());
    } catch (err) {
      // Un 401 ya lo manejó alSesionInvalida (cerró la sesión y fue a /login).
      if (err.status === 401) return;
      alert(err.message);
    }
  };

  const marcarPrincipal = async (id) => {
    try {
      await marcarDireccionPrincipal(id);
      setDirecciones(await obtenerDirecciones());
    } catch (err) {
      // Un 401 ya lo manejó alSesionInvalida (cerró la sesión y fue a /login).
      if (err.status === 401) return;
      alert(err.message);
    }
  };

  return (
    <CuentaLayout
      {...navegacion}
      seccion="direcciones"
      titulo="Mis direcciones"
      descripcion="Las direcciones donde recibís tus compras."
      accion={
        <button
          type="button"
          onClick={alternarFormulario}
          className="h-10 px-5 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-xs font-black transition"
        >
          {mostrarFormulario ? "CANCELAR" : "+ AGREGAR DIRECCIÓN"}
        </button>
      }
    >


      {/* FORMULARIO */}

      {mostrarFormulario && (
        <form
          onSubmit={agregarDireccion}
          noValidate
          className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-8"
        >

          <h2 className="text-sm font-black uppercase text-gray-900 mb-5">
            NUEVA DIRECCIÓN
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            <div>
              <label className="text-xs font-bold text-gray-500">
                NOMBRE DE LA DIRECCIÓN *
              </label>

              <input
                name="nombre"
                value={formulario.nombre}
                onChange={manejarCambio}
                placeholder="Ej: Casa"
                maxLength={50}
                className={conError(claseInput, errores.nombre)}
                {...propsError("nombre", errores.nombre)}
              />
              <ErrorCampo campo="nombre" mensaje={errores.nombre} />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500">
                CIUDAD *
              </label>

              <input
                name="ciudad"
                value={formulario.ciudad}
                onChange={manejarCambio}
                placeholder="Ej: Montevideo"
                maxLength={50}
                className={conError(claseInput, errores.ciudad)}
                {...propsError("ciudad", errores.ciudad)}
              />
              <ErrorCampo campo="ciudad" mensaje={errores.ciudad} />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500">
                CALLE *
              </label>

              <input
                name="calle"
                value={formulario.calle}
                onChange={manejarCambio}
                placeholder="Ej: Av. Italia"
                maxLength={50}
                className={conError(claseInput, errores.calle)}
                {...propsError("calle", errores.calle)}
              />
              <ErrorCampo campo="calle" mensaje={errores.calle} />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500">
                NÚMERO *
              </label>

              <input
                name="numero"
                value={formulario.numero}
                onChange={manejarCambio}
                placeholder="Ej: 1234 o S/N"
                maxLength={10}
                className={conError(claseInput, errores.numero)}
                {...propsError("numero", errores.numero)}
              />
              <ErrorCampo campo="numero" mensaje={errores.numero} />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500">
                APARTAMENTO
              </label>

              <input
                name="apartamento"
                value={formulario.apartamento}
                onChange={manejarCambio}
                placeholder="Opcional"
                maxLength={10}
                className={conError(claseInput, errores.apartamento)}
                {...propsError("apartamento", errores.apartamento)}
              />
              <ErrorCampo campo="apartamento" mensaje={errores.apartamento} />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500">
                DEPARTAMENTO *
              </label>

              <select
                name="departamento"
                value={formulario.departamento}
                onChange={manejarCambio}
                className={conError(claseInput, errores.departamento)}
                {...propsError("departamento", errores.departamento)}
              >
                <option value="">Seleccioná un departamento</option>
                {DEPARTAMENTOS.map((departamento) => (
                  <option key={departamento} value={departamento}>
                    {departamento}
                  </option>
                ))}
              </select>
              <ErrorCampo campo="departamento" mensaje={errores.departamento} />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500">
                CÓDIGO POSTAL
              </label>

              <input
                name="codigoPostal"
                value={formulario.codigoPostal}
                onChange={manejarCambio}
                placeholder="Opcional (ej: 11300)"
                inputMode="numeric"
                maxLength={5}
                className={conError(claseInput, errores.codigoPostal)}
                {...propsError("codigoPostal", errores.codigoPostal)}
              />
              <ErrorCampo campo="codigoPostal" mensaje={errores.codigoPostal} />
            </div>

          </div>

          <label className="flex items-center gap-2 mt-5 text-xs font-bold text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              name="principal"
              checked={formulario.principal}
              onChange={manejarCambio}
              className="accent-orange-500"
            />
            MARCAR COMO DIRECCIÓN PRINCIPAL
          </label>

          {errorFormulario && (
            <p role="alert" className="text-red-500 text-sm mt-5">
              {errorFormulario}
            </p>
          )}

          <div className="flex justify-end mt-6">

            <button
              type="submit"
              className="h-10 px-6 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-xs font-black"
            >
              GUARDAR DIRECCIÓN
            </button>

          </div>

        </form>
      )}

      {/* DIRECCIONES */}

      {cargando ? (

        <p className="text-center text-gray-400 text-sm py-16">
          Cargando…
        </p>

      ) : error ? (

        <p className="text-center text-red-500 text-sm py-16">
          {error}
        </p>

      ) : direcciones.length === 0 ? (

        <div className="text-center py-16">

          <p className="text-gray-400 text-sm">
            Todavía no tenés direcciones guardadas.
          </p>

          <p className="text-gray-300 text-xs mt-2">
            Agregá una dirección para utilizarla durante tus compras.
          </p>

        </div>

      ) : (

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {direcciones.map((direccion) => (

            <div
              key={direccion.id}
              className="border border-gray-200 rounded-xl p-6 relative"
            >

              <h3 className="font-black text-gray-900 text-sm uppercase">
                {direccion.nombre}
                {direccion.principal && (
                  <span className="ml-2 align-middle text-[11px] leading-5 bg-orange-500 text-white rounded-sm px-2 py-0.5 tracking-wider">
                    PRINCIPAL
                  </span>
                )}
              </h3>

              <p className="text-sm text-gray-600 mt-4">
                {direccion.calle} {direccion.numero}
                {direccion.apartamento &&
                  `, Apt. ${direccion.apartamento}`}
              </p>

              <p className="text-sm text-gray-500 mt-1">
                {direccion.ciudad}, {direccion.departamento}
              </p>

              {direccion.codigoPostal && (
                <p className="text-xs text-gray-400 mt-1">
                  CP: {direccion.codigoPostal}
                </p>
              )}

              <div className="flex gap-3 mt-6">

                {!direccion.principal && (
                  <button
                    type="button"
                    onClick={() => marcarPrincipal(direccion.id)}
                    className="text-[11px] text-orange-500 font-bold hover:underline"
                  >
                    MARCAR COMO PRINCIPAL
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    eliminarDireccion(direccion.id)
                  }
                  className="text-[11px] text-red-500 font-bold hover:underline"
                >
                  ELIMINAR
                </button>

              </div>

            </div>

          ))}

        </div>

      )}

    </CuentaLayout>
  );
}
