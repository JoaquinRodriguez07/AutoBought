import { useState } from "react";
import { cambiarPassword } from "./api";

const FORMULARIO_VACIO = { actual: "", nueva: "", repetir: "" };

const claseInput =
  "w-full mt-2 h-11 px-4 bg-white border border-gray-200 rounded-md text-[10px] text-gray-700 outline-none focus:border-orange-500 transition";

export default function CambiarPassword() {
  const [abierto, setAbierto] = useState(false);
  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);

  const manejarCambio = (e) => {
    const { name, value } = e.target;
    setError("");
    setFormulario((actual) => ({ ...actual, [name]: value }));
  };

  const abrir = () => {
    setExito(false);
    setAbierto(true);
  };

  const cancelar = () => {
    setFormulario(FORMULARIO_VACIO);
    setError("");
    setAbierto(false);
  };

  const guardar = async (e) => {
    e.preventDefault();

    if (!formulario.actual || !formulario.nueva || !formulario.repetir) {
      setError("Completá todos los campos.");
      return;
    }

    if (formulario.nueva.length < 8) {
      setError("La nueva contraseña tiene que tener al menos 8 caracteres.");
      return;
    }

    if (formulario.nueva !== formulario.repetir) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }

    setGuardando(true);
    setError("");

    try {
      await cambiarPassword(formulario.actual, formulario.nueva);
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
    <div className="mt-8 pt-6 border-t border-gray-200">

      <div className="flex items-center justify-between gap-5">

        <div>
          <h3 className="text-[10px] font-black text-gray-900 uppercase">
            Seguridad
          </h3>
          <p className="text-[9px] text-gray-400 mt-1">
            Cambiá la contraseña con la que iniciás sesión.
          </p>
        </div>

        {!abierto && (
          <button
            type="button"
            onClick={abrir}
            className="h-9 px-5 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white rounded-md text-[9px] font-black transition"
          >
            CAMBIAR CONTRASEÑA
          </button>
        )}

      </div>

      {exito && (
        <p className="text-green-600 text-[10px] mt-4">
          Tu contraseña se actualizó correctamente.
        </p>
      )}

      {abierto && (
        <form onSubmit={guardar} className="mt-5">

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

            <div>
              <label htmlFor="password-actual" className="text-[9px] font-bold text-gray-500">
                CONTRASEÑA ACTUAL
              </label>
              <input
                id="password-actual"
                type="password"
                name="actual"
                autoComplete="current-password"
                value={formulario.actual}
                onChange={manejarCambio}
                className={claseInput}
              />
            </div>

            <div>
              <label htmlFor="password-nueva" className="text-[9px] font-bold text-gray-500">
                NUEVA CONTRASEÑA
              </label>
              <input
                id="password-nueva"
                type="password"
                name="nueva"
                autoComplete="new-password"
                value={formulario.nueva}
                onChange={manejarCambio}
                className={claseInput}
              />
            </div>

            <div>
              <label htmlFor="password-repetir" className="text-[9px] font-bold text-gray-500">
                REPETIR NUEVA CONTRASEÑA
              </label>
              <input
                id="password-repetir"
                type="password"
                name="repetir"
                autoComplete="new-password"
                value={formulario.repetir}
                onChange={manejarCambio}
                className={claseInput}
              />
            </div>

          </div>

          {error && (
            <p className="text-red-500 text-[10px] mt-4">{error}</p>
          )}

          <div className="flex justify-end gap-3 mt-6">

            <button
              type="button"
              onClick={cancelar}
              className="h-10 px-6 border border-gray-200 hover:border-gray-400 text-gray-500 rounded-md text-[9px] font-black transition"
            >
              CANCELAR
            </button>

            <button
              type="submit"
              disabled={guardando}
              className="h-10 px-6 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-md text-[9px] font-black transition"
            >
              {guardando ? "GUARDANDO..." : "GUARDAR CONTRASEÑA"}
            </button>

          </div>

        </form>
      )}

    </div>
  );
}
