import { useState } from "react";
import { eliminarCuenta } from "./api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";

const ADVERTENCIA =
  "ATENCIÓN! Borrar tu cuenta es irreversible. Para confirmar, escribí tu contraseña abajo.";

export default function EliminarCuentaDialog({ open, onOpenChange, onDeleted }) {
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState("");
  const [eliminando, setEliminando] = useState(false);

  const cambiarApertura = (abierta) => {
    onOpenChange(abierta);
    if (!abierta) {
      setPassword("");
      setMostrarPassword(false);
      setError("");
    }
  };

  const confirmarEliminacion = async (event) => {
    event.preventDefault();
    if (!password || eliminando) return;

    setError("");
    setEliminando(true);
    try {
      await eliminarCuenta(password);
      cambiarApertura(false);
      onDeleted();
    } catch (err) {
      setError(err.message || "No pudimos borrar tu cuenta. Intentá de nuevo.");
    } finally {
      setEliminando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={cambiarApertura}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md rounded-xl bg-white p-6 text-gray-900"
      >
        <DialogHeader>
          <DialogTitle className="text-base font-black text-red-700">
            {ADVERTENCIA}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Confirmá el borrado de tu cuenta ingresando tu contraseña.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={confirmarEliminacion}>
          <label htmlFor="eliminar-cuenta-password" className="text-xs font-bold text-gray-700">
            CONTRASEÑA
          </label>
          <div className="relative">
            <input
              id="eliminar-cuenta-password"
              type={mostrarPassword ? "text" : "password"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className="w-full mt-2 h-11 px-4 pr-12 bg-gray-50 border border-gray-200 rounded-md text-sm outline-hidden focus:border-orange-500 transition"
            />
            <button
              type="button"
              aria-label={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={() => setMostrarPassword((actual) => !actual)}
              className="absolute right-3 top-[20px] text-gray-400 hover:text-orange-500 transition"
            >
              {mostrarPassword ? "◉" : "○"}
            </button>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 mt-3">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => cambiarApertura(false)}
              disabled={eliminando}
              className="h-10 px-5 bg-white border border-gray-300 text-gray-700 hover:border-gray-400 rounded-md text-xs font-black transition disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!password || eliminando}
              className="h-10 px-5 bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-md text-xs font-black transition"
            >
              {eliminando ? "BORRANDO..." : "Borrar Cuenta"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
