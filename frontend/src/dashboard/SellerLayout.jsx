// El armado del portal del vendedor: menú lateral y contenido.

import { useEffect, useState } from "react";
import {
  BoxesIcon,
  ChartLineIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  MessageCircleQuestionIcon,
  PackageCheckIcon,
  StoreIcon,
  TrendingUpIcon,
  TrophyIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { decodeToken, isAdmin } from "../auth";
import logo from "../assets/logo.png";
import logoBlanco from "../assets/logo-blanco.png";

// Secciones del portal, agrupadas por tarea, en el orden del menú. El
// valor va en la URL (?vista=), salvo "resumen", que es la de entrada.
export const GROUPS = [
  {
    title: null,
    views: [
      { rawValue: "summary", texto: "Resumen", Icon: LayoutDashboardIcon },
      { rawValue: "orders", texto: "Pedidos", Icon: ClipboardListIcon },
    ],
  },
  {
    title: "Ventas",
    views: [
      { rawValue: "sales", texto: "Evolución de ventas", Icon: ChartLineIcon },
      { rawValue: "mas-vendidos", texto: "Más vendidos", Icon: TrophyIcon },
      { rawValue: "forecast", texto: "Proyección de demanda", Icon: TrendingUpIcon },
    ],
  },
  {
    title: "Inventario",
    views: [
      { rawValue: "stock", texto: "Stock", Icon: BoxesIcon },
      { rawValue: "risk", texto: "Reposición", Icon: PackageCheckIcon },
    ],
  },
  {
    title: "Asistente",
    views: [{ rawValue: "ask", texto: "Preguntar", Icon: MessageCircleQuestionIcon }],
  },
  // Solo la ven los administradores (SCRUM-175).
  {
    title: "Administración",
    views: [{ rawValue: "team", texto: "Equipo", Icon: UsersIcon, onlyAdmin: true }],
  },
];

export const VIEWS = GROUPS.flatMap((grupo) => grupo.views);

function groupsFor(sessionUser) {
  const admin = isAdmin(sessionUser);
  return GROUPS.map((grupo) => ({ ...grupo, views: grupo.views.filter((v) => !v.onlyAdmin || admin) })).filter(
    (grupo) => grupo.views.length > 0
  );
}

// Nombre del vendedor: viene en el token de sesión (el vendedor no tiene
// perfil en /me como el cliente). Una sesión vieja, sin nombre en el token,
// usa la parte del correo antes de la @.
export function sellerName(sessionUser) {
  const displayName = sessionUser?.displayName || (sessionUser?.token && decodeToken(sessionUser.token)?.name);
  if (displayName) return displayName;
  return sessionUser?.email ? sessionUser.email.split("@")[0] : "";
}

function initials(sessionUser) {
  const palabras = sellerName(sessionUser).split(/\s+/).filter(Boolean);
  const letras = palabras.length > 1 ? palabras[0][0] + palabras[1][0] : (palabras[0] ?? "").slice(0, 2);
  return letras.toUpperCase() || "V";
}

// El logo de la tienda: el del Navbar sobre fondo claro y, sobre el oscuro
// del menú, su versión con "Auto" en blanco.
function Logo({ oscura = false }) {
  return (
    <img src={oscura ? logoBlanco : logo} alt="AutoBought" className={cn("w-auto object-contain", oscura ? "mx-auto h-12" : "h-10")} />
  );
}

// `avisos`: un número al lado de una sección (por ejemplo, cuántos
// repuestos hay que reponer), como { riesgo: 12 }.
function Menu({ vista, onView, onStore, onCloseSession, sessionUser, notices }) {
  return (
    <div className="flex h-full flex-col">
      {/* Arriba, centrado en el menú. */}
      <div className="px-6 pt-6 pb-6 text-center">
        <Logo oscura />
        {/* El tracking deja espacio a la derecha de la última letra: el pl lo compensa. */}
        <p className="mt-2 pl-[3px] text-[10px] font-bold tracking-[3px] text-gray-500 uppercase">Portal del vendedor</p>
      </div>

      <nav aria-label="Secciones del dashboard" className="flex-1 overflow-y-auto px-3 flex flex-col gap-5">
        {groupsFor(sessionUser).map((grupo) => (
          <div key={grupo.title ?? "home"}>
            {grupo.title && (
              <p className="px-3 mb-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{grupo.title}</p>
            )}
            <ul className="flex flex-col gap-0.5">
              {grupo.views.map(({ rawValue, texto, Icon, inDesarrollo }) => {
                const active = vista === rawValue;
                const aviso = notices?.[rawValue];
                return (
                  <li key={rawValue}>
                    <button
                      type="button"
                      onClick={() => onView(rawValue)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition",
                        active
                          ? "bg-orange-500/15 text-orange-400 font-medium"
                          : "text-gray-300 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {active && (
                        <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-orange-500" aria-hidden="true" />
                      )}
                      <Icon
                        className={cn("size-4 shrink-0", active ? "text-orange-400" : "text-gray-400 group-hover:text-white")}
                        aria-hidden="true"
                      />
                      <span className="flex-1 truncate">{texto}</span>
                      {aviso > 0 && (
                        <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-red-300">
                          <span className="sr-only">: </span>
                          {aviso}
                        </span>
                      )}
                      {inDesarrollo && (
                        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                          En desarrollo
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3 flex flex-col gap-1">
        <button
          type="button"
          onClick={onStore}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white"
        >
          <StoreIcon className="size-4" aria-hidden="true" />
          Ver la tienda
        </button>
        <div className="mt-1 flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-orange-500 text-xs font-bold text-white"
          >
            {initials(sessionUser)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white">{sellerName(sessionUser)}</p>
            <p className="text-xs text-gray-400">{isAdmin(sessionUser) ? "Administrador" : "Vendedor"}</p>
          </div>
          <button
            type="button"
            onClick={onCloseSession}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="rounded-md p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
          >
            <LogOutIcon className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Marco del portal del vendedor, con los colores de la tienda: menú lateral con las
// secciones y el usuario, y la página con su título, acciones y `barra`
// (los filtros). No usa el Navbar ni el footer de la tienda, así no se
// confunde con lo que ve un cliente. En celular el menú se abre con el
// botón de la barra de arriba.
export default function SellerLayout({
  sessionUser,
  vista,
  onView,
  onStore,
  onCloseSession,
  notices,
  titleBefore,
  title,
  description,
  actions,
  bar,
  children,
}) {
  const [openMenu, setOpenMenu] = useState(false);

  // Con el menú de celular abierto, Escape lo cierra.
  useEffect(() => {
    if (!openMenu) return;
    const onType = (event) => event.key === "Escape" && setOpenMenu(false);
    document.addEventListener("keydown", onType);
    return () => document.removeEventListener("keydown", onType);
  }, [openMenu]);

  const choose = (rawValue) => {
    setOpenMenu(false);
    onView(rawValue);
  };

  const propsMenu = { vista, onView: choose, onStore, onCloseSession, sessionUser, notices };

  return (
    <div className="min-h-screen bg-gray-50 text-foreground font-sans antialiased">
      <aside className="hidden lg:block fixed inset-y-0 left-0 z-30 w-64 bg-[#151719]">
        <Menu {...propsMenu} />
      </aside>

      {openMenu && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setOpenMenu(false)}
            className="absolute inset-0 bg-gray-900/40"
          />
          <div role="dialog" aria-modal="true" aria-label="Menú" className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-[#151719] shadow-2xl">
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={() => setOpenMenu(false)}
              className="absolute top-5 right-3 rounded-md p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
            >
              <XIcon className="size-5" />
            </button>
            <Menu {...propsMenu} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Solo en celular: el menú lateral no entra. */}
        <header className="lg:hidden sticky top-0 z-20 h-14 border-b bg-white/90 backdrop-blur flex items-center gap-3 px-4">
          <button
            type="button"
            aria-label="Abrir menú"
            onClick={() => setOpenMenu(true)}
            className="-ml-1 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <MenuIcon className="size-5" />
          </button>
          <Logo />
        </header>

        <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-9 max-w-[1320px]">
          {titleBefore}
          {/* Una descripción larga pasa a dos líneas; las acciones quedan a la derecha. */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0 sm:flex-1">
              <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight">{title}</h1>
              {description && <p className="text-sm text-muted-foreground mt-1 max-w-3xl">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-2 sm:shrink-0">{actions}</div>}
          </div>
          {bar}
          <div className="mt-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
