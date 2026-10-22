import { useState } from "react";
import { pedirRecuperacion } from "./api";
import ErrorCampo from "./ErrorCampo";
import { conError, propsError } from "./erroresCampo";
import TarjetaCuenta, {
  claseBotonCuenta,
  claseEnlaceCuenta,
  claseInputCuenta,
} from "./TarjetaCuenta";
import { validarEmail } from "./validaciones";

// Mismo texto que el backend: se muestra igual exista o no el correo.
const MENSAJE_ENVIADO =
  "Si el correo está registrado, te mandamos un enlace para elegir una contraseña nueva.";

export default function RecuperarPassword({ onVolverAlLogin, ...propsNavbar }) {
  const [email, setEmail] = useState("");
  const [errorEmail, setErrorEmail] = useState(null);
  const [error, setError] = useState("");
  const [enviado, setEnviado] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();

    const errorValidacion = validarEmail(email);
    setErrorEmail(errorValidacion);
    if (errorValidacion) return;

    setEnviando(true);
    setError("");

    try {
      setEnviado((await pedirRecuperacion(email.trim())) || MENSAJE_ENVIADO);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <TarjetaCuenta
      titulo="Recuperar contraseña"
      subtitulo="Te mandamos un enlace a tu correo para elegir una contraseña nueva."
      {...propsNavbar}
    >
      {enviado ? (
        <div role="status" className="mt-6 bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-[10px] font-semibold">
          {enviado} Revisá también la carpeta de spam.
        </div>
      ) : (
        <form onSubmit={enviar} noValidate className="mt-6">

          {error && (
            <div role="alert" className="mb-5 bg-red-50 border border-red-200 text-red-500 rounded-md px-4 py-3 text-[9px] font-semibold">
              {error}
            </div>
          )}

          <label htmlFor="recuperar-email" className="text-[9px] font-bold text-gray-700">
            CORREO ELECTRÓNICO
          </label>
          <input
            id="recuperar-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrorEmail(null);
            }}
            placeholder="tu@email.com"
            className={conError(claseInputCuenta, errorEmail)}
            {...propsError("email", errorEmail)}
          />
          <ErrorCampo campo="email" mensaje={errorEmail} />

          <button type="submit" disabled={enviando} className={claseBotonCuenta}>
            {enviando ? "ENVIANDO..." : "ENVIAR ENLACE"}
          </button>

        </form>
      )}

      <p className="text-center text-[9px] text-gray-500 mt-6">
        <button type="button" onClick={onVolverAlLogin} className={claseEnlaceCuenta}>
          Volver a iniciar sesión
        </button>
      </p>
    </TarjetaCuenta>
  );
}
