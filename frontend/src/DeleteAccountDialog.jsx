// El diálogo para confirmar la baja de una cuenta de cliente.

import { useEffect, useState } from "react";
import { deleteAccount } from "./api";
import { PasswordField } from "./AccessScreen";

const ORDER_PENDING_MESSAGE =
  "Aún hay pedidos pendientes. Esperá a que se completen o cancelalos para poder borrar tu cuenta.";

function messageFor(error) {
  if (error.status === 400) return "Contraseña equivocada.";
  if (error.status === 409) return ORDER_PENDING_MESSAGE;
  return error.message || "No pudimos borrar tu cuenta. Intentá de nuevo.";
}

export default function DeleteAccountDialog({ onClose, onDeleted }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !loading) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [loading, onClose]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!password) {
      setError("Ingresá tu contraseña.");
      return;
    }

    setLoading(true);
    try {
      await deleteAccount(password);
      onDeleted();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setLoading(false);
    }
  };

  const closeFromBackdrop = (event) => {
    if (event.target === event.currentTarget && !loading) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-5"
      onMouseDown={closeFromBackdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-borrar-cuenta"
        className="w-full max-w-[440px] bg-white rounded-xl p-6 shadow-2xl"
      >
        <h2 id="titulo-borrar-cuenta" className="text-lg font-black">
          Borrar mi cuenta
        </h2>
        <p className="mt-3 text-sm text-gray-700">
          ATENCIÓN! Borrar tu cuenta es irreversible. Para confirmar, escribí tu contraseña abajo.
        </p>

        <form onSubmit={submit}>
          <label
            htmlFor="delete-account-password"
            className="block mt-5 mb-1.5 text-xs font-bold text-gray-700"
          >
            CONTRASEÑA
          </label>
          <PasswordField
            id="delete-account-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Tu contraseña"
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-hidden focus:border-orange-500"
            disabled={loading}
          />

          {error && (
            <p role="alert" className="mt-3 text-sm font-semibold text-red-600">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-md border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-red-600 px-4 py-2.5 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? "Borrando..." : "Borrar Cuenta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
