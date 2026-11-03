import { useState } from "react";
import { guardarPreferenciasMails } from "./api";
import SeccionCuenta from "./SeccionCuenta";

/**
 * Interruptor «Ofertas y recordatorios por mail» del perfil: carrito
 * abandonado, mantenimiento y baja de precio de favoritos. Los mails de
 * la cuenta y de los pedidos llegan siempre.
 */
export default function PreferenciasMails({ usuario, onActualizarUsuario }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Mientras el perfil no cargó, se muestra el valor por defecto (sí).
  const recibe = usuario?.recibeOfertas ?? true;

  const cambiar = async () => {
    setGuardando(true);
    setError("");

    try {
      const perfil = await guardarPreferenciasMails(!recibe);
      onActualizarUsuario?.({ ...usuario, ...perfil });
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <SeccionCuenta
      titulo="Mails"
      descripcion="Elegí qué mails querés recibir de la tienda."
      idTitulo="titulo-mails"
    >

      <div className="flex items-center justify-between gap-5">

        <div>
          <h4 id="titulo-preferencias-mails" className="text-sm font-bold text-gray-900">
            Ofertas y recordatorios por mail
          </h4>
          <p className="text-xs text-gray-500 mt-1">
            Carrito abandonado, recordatorios de mantenimiento y bajas de precio de tus favoritos.
            Los mails de tu cuenta y de tus pedidos llegan siempre.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={recibe}
          aria-labelledby="titulo-preferencias-mails"
          onClick={cambiar}
          disabled={guardando}
          className={`relative shrink-0 w-11 h-6 rounded-full transition disabled:opacity-60 ${
            recibe ? "bg-orange-500" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-xs transition-transform ${
              recibe ? "translate-x-5" : ""
            }`}
          />
        </button>

      </div>

      {error && (
        <p role="alert" className="text-red-600 text-sm mt-4">{error}</p>
      )}

    </SeccionCuenta>
  );
}
