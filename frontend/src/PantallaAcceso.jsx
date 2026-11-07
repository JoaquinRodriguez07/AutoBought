// Piezas comunes de las pantallas de login y registro.

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import Navbar from "./Navbar";
import { IconoCheck } from "./Iconos";
import repuestos from "./assets/repuestos.jpg";

/** Etiqueta, campo y, debajo, el error o una ayuda. `accion` va a la derecha de la etiqueta. */
export function Campo({ id, etiqueta, accion, ayuda, error, children }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <label htmlFor={id} className="text-xs font-bold text-gray-700">
          {etiqueta}
        </label>
        {accion}
      </div>
      {children}
      {error ?? (ayuda && <div className="text-xs text-gray-500 mt-1.5">{ayuda}</div>)}
    </div>
  );
}

/** Campo de contraseña con el botón para mostrarla u ocultarla. */
export function CampoPassword({ className, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${className} pr-12`} />
      <button
        type="button"
        onClick={() => setVisible((actual) => !actual)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-md flex items-center justify-center text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition"
      >
        {visible ? <EyeOffIcon className="w-[18px] h-[18px]" /> : <EyeIcon className="w-[18px] h-[18px]" />}
      </button>
    </div>
  );
}

/** El mensaje de error general del formulario (ej. credenciales incorrectas). */
export function AvisoError({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="mt-6 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm font-semibold">
      {children}
    </div>
  );
}

/**
 * El marco del registro: el formulario a la izquierda y, a la derecha, la
 * foto con lo que gana el cliente (en celular, solo el formulario).
 */
export default function PantallaAcceso({ propsNavbar, etiqueta, titulo, beneficios, ancho = "max-w-[980px]", children }) {
  return (
    <div
      className="min-h-screen flex flex-col font-sans"
      // El mismo fondo que el login.
      style={{ backgroundImage: "linear-gradient(rgba(0,0,0,1), rgb(73, 34, 2))" }}
    >
      <Navbar paginaActual="login" {...propsNavbar} />

      <main className="flex-1 flex items-center justify-center px-5 pt-24 pb-10">
        <div
          className={`w-full ${ancho} bg-white rounded-2xl overflow-hidden shadow-2xl grid grid-cols-1 md:grid-cols-[1.25fr_0.75fr]`}
        >
          <div className="p-8 md:p-10 flex flex-col justify-center">{children}</div>

          <aside className="hidden md:flex relative overflow-hidden flex-col justify-end p-8 text-white">
            <img
              src={repuestos}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* El mismo oscurecido que el panel del login. */}
            <div className="absolute inset-0 bg-black/45" />
            <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/20 to-transparent" />

            <div className="relative">
              <p className="text-orange-500 text-xs font-black tracking-[4px]">{etiqueta}</p>
              <h2 className="text-3xl font-black italic uppercase leading-[0.95] mt-3">
                {titulo.map((linea) => (
                  <span key={linea} className="block">
                    {linea}{" "}
                  </span>
                ))}
              </h2>
              <div className="w-10 h-[3px] bg-orange-500 mt-5 rounded-full" />
              <ul className="mt-5 flex flex-col gap-2.5">
                {beneficios.map((beneficio) => (
                  <li key={beneficio} className="flex items-center gap-3 text-sm text-gray-200">
                    <span className="w-6 h-6 shrink-0 rounded-full bg-orange-500/20 ring-1 ring-orange-500/40 flex items-center justify-center">
                      <IconoCheck className="w-3.5 h-3.5 text-orange-400" />
                    </span>
                    {beneficio}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

/** Encabezado del formulario: etiqueta naranja, título y bajada. */
export function EncabezadoAcceso({ titulo, bajada }) {
  return (
    <>
      <p className="text-orange-500 text-xs font-black tracking-[4px]">AUTOBOUGHT</p>
      <h1 className="text-3xl font-black italic uppercase mt-2">{titulo}</h1>
      <p className="text-gray-500 text-sm mt-2">{bajada}</p>
    </>
  );
}
