import { useEffect, useState } from "react";
import { getProfile, saveMailPreferences } from "./api";
import AccountSection from "./AccountSection";

/**
 * Interruptor «Ofertas y recordatorios por mail» del perfil: carrito
 * abandonado, mantenimiento y baja de precio de favoritos. Los mails de
 * la cuenta y de los pedidos llegan siempre.
 */
export default function MailPreferences({ sessionUser, onUpdateUser }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // La sesión guarda la preferencia del momento del login, y puede haber
  // cambiado después (por ejemplo, con «No quiero recibir estos mails» del
  // mail). Al abrir la pantalla se pide la del servidor.
  const token = sessionUser?.token;
  useEffect(() => {
    if (!token) return;
    let active = true;
    getProfile(token)
      .then((profile) => {
        if (active && profile.recibeOfertas !== sessionUser?.recibeOfertas) {
          onUpdateUser?.({ ...sessionUser, recibeOfertas: profile.recibeOfertas });
        }
      })
      .catch(() => {
        // Si falla, queda el valor de la sesión: guardar sigue funcionando.
      });
    return () => {
      active = false;
    };
    // Solo al abrir la pantalla o si cambia la sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Mientras el perfil no cargó, se muestra el valor por defecto (sí).
  const recibe = sessionUser?.recibeOfertas ?? true;

  const change = async () => {
    setSaving(true);
    setError("");

    try {
      const profile = await saveMailPreferences(!recibe);
      onUpdateUser?.({ ...sessionUser, ...profile });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccountSection
      title="Mails"
      description="Elegí qué mails querés recibir de la tienda."
      titleId="titulo-mails"
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
          onClick={change}
          disabled={saving}
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

    </AccountSection>
  );
}
