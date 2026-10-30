import { useState } from "react";
import { cambiarPassword } from "./api";
import { guardarSesion, obtenerSesion } from "./auth";
import ErrorCampo from "./ErrorCampo";
import SeccionCuenta, { claseBotonCancelar, claseBotonGuardar, claseBotonSeccion } from "./SeccionCuenta";
import { conError, propsError } from "./erroresCampo";
import { validarCambioPassword } from "./validaciones";

const FORMULARIO_VACIO = { actual: "", nueva: "", repetir: "" };

const claseInput =
  "w-full mt-2 h-11 px-4 bg-white border border-gray-200 rounded-md text-sm text-gray-700 outline-hidden focus:border-orange-500 transition";

export default function CambiarPassword({ email = "" }) {
  const [abierto, setAbierto] = useState(false);
  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [errores, setErrores] = useState({});
  const [exito, setExito] = useState(false);
  const [sinTokenNuevo, setSinTokenNuevo] = useState(false);

  const manejarCambio = (e) => {
    const { name, value } = e.target;
    setError("");
    setErrores((actuales) => ({ ...actuales, [name]: undefined }));
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  const abrir = () => {
    setExito(false);
    setSinTokenNuevo(false);
    setAbierto(true);
  };

  const cancelar = () => {
    setFormulario(FORMULARIO_VACIO);
    setError("");
    setErrores({});
    setAbierto(false);
  };

  const guardar = async (e) => {
    e.preventDefault();

    const erroresFormulario = validarCambioPassword(formulario, email);
    setErrores(erroresFormulario);
    if (Object.keys(erroresFormulario).length > 0) return;

    setGuardando(true);
    setError("");

    try {
      const data = await cambiarPassword(formulario.actual, formulario.nueva);

      // El backend invalidó todos los tokens anteriores, también el de esta
      // sesión: se guarda el nuevo ANTES de mostrar el éxito para que el
      // próximo pedido (y la renovación automática) ya use el válido.
      // Guardarlo actualiza el `usuario` de App (ver alGuardarSesion).
      const sesion = obtenerSesion();
      if (sesion && data?.access_token) {
        guardarSesion({
          ...sesion,
          token: data.access_token,
          ...(data.token_type ? { tokenType: data.token_type } : {}),
        });
        setSinTokenNuevo(false);
      } else if (sesion) {
        // La contraseña se cambió pero no llegó un token nuevo: el actual
        // está revocado. No se muestra un éxito engañoso.
        setSinTokenNuevo(true);
      }

      setFormulario(FORMULARIO_VACIO);
      setAbierto(false);
      setExito(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <SeccionCuenta
      titulo="Contraseña"
      descripcion="Cambiá la contraseña con la que iniciás sesión."
      idTitulo="titulo-contrasena"
      accion={
        !abierto && (
          <button type="button" onClick={abrir} className={claseBotonSeccion}>
            CAMBIAR CONTRASEÑA
          </button>
        )
      }
    >
      {(exito || abierto) && (
        <>
          {exito && !sinTokenNuevo && (
            <p role="status" className="bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-sm">
              Tu contraseña se actualizó correctamente.
            </p>
          )}

          {exito && sinTokenNuevo && (
            <p role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-4 py-3 text-sm">
              Tu contraseña se actualizó, pero tu sesión actual ya no es válida.
              Iniciá sesión de nuevo con la contraseña nueva.
            </p>
          )}

          {abierto && (
            <form onSubmit={guardar}>

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
                    name="actual"
                    autoComplete="current-password"
                    value={formulario.actual}
                    onChange={manejarCambio}
                    className={conError(claseInput, errores.actual)}
                    {...propsError("actual", errores.actual)}
                  />
                  <ErrorCampo campo="actual" mensaje={errores.actual} />
                </div>

                <div>
                  <label htmlFor="password-nueva" className="text-xs font-bold text-gray-500">
                    NUEVA CONTRASEÑA
                  </label>
                  <input
                    id="password-nueva"
                    type="password"
                    name="nueva"
                    autoComplete="new-password"
                    value={formulario.nueva}
                    onChange={manejarCambio}
                    className={conError(claseInput, errores.nueva)}
                    {...propsError("nueva", errores.nueva)}
                  />
                  <ErrorCampo campo="nueva" mensaje={errores.nueva} />
                </div>

                <div>
                  <label htmlFor="password-repetir" className="text-xs font-bold text-gray-500">
                    REPETIR NUEVA CONTRASEÑA
                  </label>
                  <input
                    id="password-repetir"
                    type="password"
                    name="repetir"
                    autoComplete="new-password"
                    value={formulario.repetir}
                    onChange={manejarCambio}
                    className={conError(claseInput, errores.repetir)}
                    {...propsError("repetir", errores.repetir)}
                  />
                  <ErrorCampo campo="repetir" mensaje={errores.repetir} />
                </div>

              </div>

              {error && (
                <p role="alert" className="text-red-600 text-sm mt-4">{error}</p>
              )}

              <div className="flex justify-end gap-3 mt-6">

                <button
                  type="button"
                  onClick={cancelar}
                  className={claseBotonCancelar}
                >
                  CANCELAR
                </button>

                <button
                  type="submit"
                  disabled={guardando}
                  className={claseBotonGuardar}
                >
                  {guardando ? "GUARDANDO..." : "GUARDAR CONTRASEÑA"}
                </button>

              </div>

            </form>
          )}
        </>
      )}
    </SeccionCuenta>
  );
}
