// El armado común de las pantallas de «Mi cuenta» (menú y contenido).

import { useNavigate } from "react-router-dom";

import Navbar from "./Navbar";
import EncabezadoPagina from "./EncabezadoPagina";
import { usePedidos } from "./context/PedidosContext";
import { SECCIONES_CUENTA } from "./seccionesCuenta";
import { IconoSalir } from "./Iconos";

/**
 * CuentaLayout
 * ==========================================
 * El armado común de "Mi cuenta": una franja baja arriba, el menú de la
 * izquierda (con el nombre y el correo del cliente) y el contenido de la
 * sección. Cada página solo pone su título y su contenido.
 *
 * En celular no entran las dos columnas: el menú es su propia página
 * (/cuenta) y cada sección tiene un "← Mi cuenta" para volver.
 *
 * Props:
 *  - seccion     clave de SECCIONES_CUENTA (null en /cuenta, el inicio)
 *  - titulo      título de la sección
 *  - descripcion texto corto debajo del título (opcional)
 *  - accion      botón a la derecha del título, ej. "Agregar" (opcional)
 *  - migas       camino de la franja de arriba (opcional; por defecto,
 *                Inicio › Mi cuenta › titulo)
 *  - usuario, cantidadFavoritos y los on* de navegación, que también
 *    usa la Navbar (App.jsx los pasa en propsNavbar).
 */
export default function CuentaLayout({
  seccion = null,
  titulo,
  descripcion,
  accion,
  migas,
  children,
  ...propsNavbar
}) {
  const navigate = useNavigate();
  const { enCurso } = usePedidos();
  const { usuario, onHome, onCerrarSesion } = propsNavbar;
  const enInicio = seccion === null;

  const nombre = [usuario?.nombre, usuario?.apellido].filter(Boolean).join(" ") || "Mi cuenta";

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-gray-900 font-sans">

      <Navbar paginaActual={seccion === "compras" ? "pedidos" : "perfil"} {...propsNavbar} />

      <main>

        <EncabezadoPagina
          compacto
          migas={
            migas ??
            (enInicio
              ? [{ texto: "Inicio", ir: onHome }, "Mi cuenta"]
              : [{ texto: "Inicio", ir: onHome }, { texto: "Mi cuenta", ir: () => navigate("/cuenta") }, titulo])
          }
          titulo="Mi cuenta"
        />

        <div className="px-5 md:px-10 pt-6 lg:pt-8 pb-16">
          <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 lg:gap-8">

            {/* MENÚ. En celular solo se ve en /cuenta. */}

            <aside className={`${enInicio ? "" : "hidden lg:block"} lg:self-start bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden`}>

              <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
                <span
                  aria-hidden="true"
                  className="w-11 h-11 shrink-0 rounded-full bg-orange-500 text-white text-lg font-black flex items-center justify-center"
                >
                  {(usuario?.nombre || "U").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-black truncate">{nombre}</p>
                  <p className="text-xs text-gray-500 truncate">{usuario?.email}</p>
                </div>
              </div>

              <nav aria-label="Mi cuenta" className="p-2">
                <ul className="space-y-0.5">
                  {SECCIONES_CUENTA.map(({ clave, texto, Icono, ruta }) => {
                    const actual = clave === seccion;
                    const numero = clave === "compras" ? enCurso.length : 0;
                    return (
                      <li key={clave}>
                        <button
                          type="button"
                          onClick={() => navigate(ruta)}
                          aria-current={actual ? "page" : undefined}
                          className={`w-full flex items-center gap-3 px-3 py-3 lg:py-2.5 rounded-lg text-sm text-left transition ${
                            actual
                              ? "bg-orange-50 text-orange-600 font-bold"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <Icono className="w-5 h-5 shrink-0" />
                          <span className="flex-1">{texto}</span>
                          {numero > 0 && (
                            <span className="text-xs font-black bg-orange-500 text-white rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">
                              {numero}
                              <span className="sr-only"> en curso</span>
                            </span>
                          )}
                          <span aria-hidden="true" className="lg:hidden text-gray-300">›</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div className="border-t border-gray-100 p-2">
                <button
                  type="button"
                  onClick={onCerrarSesion}
                  className="w-full flex items-center gap-3 px-3 py-3 lg:py-2.5 rounded-lg text-sm text-left text-red-600 hover:bg-red-50 transition"
                >
                  <IconoSalir className="w-5 h-5 shrink-0" />
                  Cerrar sesión
                </button>
              </div>
            </aside>

            {/* CONTENIDO */}

            <div className={`min-w-0 ${enInicio ? "hidden lg:block" : ""}`}>

              {!enInicio && (
                <button
                  type="button"
                  onClick={() => navigate("/cuenta")}
                  className="lg:hidden mb-4 text-sm font-bold text-gray-600 hover:text-orange-500"
                >
                  ← Mi cuenta
                </button>
              )}

              {(titulo || accion) && (
                <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-2xl font-black">{titulo}</h2>
                    {descripcion && <p className="text-sm text-gray-500 mt-1">{descripcion}</p>}
                  </div>
                  {accion}
                </div>
              )}

              {children}
            </div>

          </div>
        </div>

      </main>
    </div>
  );
}
