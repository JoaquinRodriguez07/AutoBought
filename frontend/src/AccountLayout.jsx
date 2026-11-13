// El armado común de las pantallas de «Mi cuenta» (menú y contenido).

import { useNavigate } from "react-router-dom";

import Navbar from "./Navbar";
import PageHeader from "./PageHeader";
import { useOrders } from "./context/OrdersContext";
import { ACCOUNT_SECTIONS } from "./accountSections";
import { LogoutIcon, TrashIcon } from "./Icons";
import { isSeller } from "./auth";

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
export default function AccountLayout({
  section = null,
  title,
  description,
  action,
  migas,
  children,
  ...propsNavbar
}) {
  const navigate = useNavigate();
  const { inProgress } = useOrders();
  const { sessionUser, onHome, onCloseSession, onDeleteAccount } = propsNavbar;
  const inHome = section === null;

  const displayName = [sessionUser?.displayName, sessionUser?.lastName].filter(Boolean).join(" ") || "Mi cuenta";

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-gray-900 font-sans">

      <Navbar currentPage={section === "purchases" ? "orders" : "profile"} {...propsNavbar} />

      <main>

        <PageHeader
          compact
          migas={
            migas ??
            (inHome
              ? [{ texto: "Inicio", goTo: onHome }, "Mi cuenta"]
              : [{ texto: "Inicio", goTo: onHome }, { texto: "Mi cuenta", goTo: () => navigate("/cuenta") }, title])
          }
          title="Mi cuenta"
        />

        <div className="px-5 md:px-10 pt-6 lg:pt-8 pb-16">
          <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 lg:gap-8">

            {/* MENÚ. En celular solo se ve en /cuenta. */}

            <aside className={`${inHome ? "" : "hidden lg:block"} lg:self-start bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden`}>

              <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
                <span
                  aria-hidden="true"
                  className="w-11 h-11 shrink-0 rounded-full bg-orange-500 text-white text-lg font-black flex items-center justify-center"
                >
                  {(sessionUser?.displayName || "U").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-black truncate">{displayName}</p>
                  <p className="text-xs text-gray-500 truncate">{sessionUser?.email}</p>
                </div>
              </div>

              <nav aria-label="Mi cuenta" className="p-2">
                <ul className="space-y-0.5">
                  {ACCOUNT_SECTIONS.map(({ key, texto, Icon, route }) => {
                    const current = key === section;
                    const number = key === "purchases" ? inProgress.length : 0;
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => navigate(route)}
                          aria-current={current ? "page" : undefined}
                          className={`w-full flex items-center gap-3 px-3 py-3 lg:py-2.5 rounded-lg text-sm text-left transition ${
                            current
                              ? "bg-orange-50 text-orange-600 font-bold"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <Icon className="w-5 h-5 shrink-0" />
                          <span className="flex-1">{texto}</span>
                          {number > 0 && (
                            <span className="text-xs font-black bg-orange-500 text-white rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">
                              {number}
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
                  onClick={onCloseSession}
                  className="w-full flex items-center gap-3 px-3 py-3 lg:py-2.5 rounded-lg text-sm text-left text-red-600 hover:bg-red-50 transition"
                >
                  <LogoutIcon className="w-5 h-5 shrink-0" />
                  Cerrar sesión
                </button>
                {sessionUser && !isSeller(sessionUser) && onDeleteAccount && (
                  <button
                    type="button"
                    onClick={onDeleteAccount}
                    className="w-full flex items-center gap-3 px-3 py-3 lg:py-2.5 rounded-lg text-sm text-left text-red-600 hover:bg-red-50 transition"
                  >
                    <TrashIcon className="w-5 h-5 shrink-0" />
                    Borrar mi cuenta
                  </button>
                )}
              </div>
            </aside>

            {/* CONTENIDO */}

            <div className={`min-w-0 ${inHome ? "hidden lg:block" : ""}`}>

              {!inHome && (
                <button
                  type="button"
                  onClick={() => navigate("/cuenta")}
                  className="lg:hidden mb-4 text-sm font-bold text-gray-600 hover:text-orange-500"
                >
                  ← Mi cuenta
                </button>
              )}

              {(title || action) && (
                <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-2xl font-black">{title}</h2>
                    {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
                  </div>
                  {action}
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
