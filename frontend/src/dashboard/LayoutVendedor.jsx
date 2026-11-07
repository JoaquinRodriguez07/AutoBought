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
import { decodeToken, esAdmin } from "../auth";
import logo from "../assets/logo.png";
import logoBlanco from "../assets/logo-blanco.png";

// Secciones del portal, agrupadas por tarea, en el orden del menú. El
// valor va en la URL (?vista=), salvo "resumen", que es la de entrada.
export const GRUPOS = [
  {
    titulo: null,
    vistas: [
      { valor: "resumen", texto: "Resumen", Icono: LayoutDashboardIcon },
      { valor: "pedidos", texto: "Pedidos", Icono: ClipboardListIcon },
    ],
  },
  {
    titulo: "Ventas",
    vistas: [
      { valor: "ventas", texto: "Evolución de ventas", Icono: ChartLineIcon },
      { valor: "mas-vendidos", texto: "Más vendidos", Icono: TrophyIcon },
      { valor: "proyeccion", texto: "Proyección de demanda", Icono: TrendingUpIcon },
    ],
  },
  {
    titulo: "Inventario",
    vistas: [
      { valor: "stock", texto: "Stock", Icono: BoxesIcon },
      { valor: "riesgo", texto: "Reposición", Icono: PackageCheckIcon },
    ],
  },
  {
    titulo: "Asistente",
    vistas: [{ valor: "preguntar", texto: "Preguntar", Icono: MessageCircleQuestionIcon, enDesarrollo: true }],
  },
  // Solo la ven los administradores (SCRUM-175).
  {
    titulo: "Administración",
    vistas: [{ valor: "equipo", texto: "Equipo", Icono: UsersIcon, soloAdmin: true }],
  },
];

export const VISTAS = GRUPOS.flatMap((grupo) => grupo.vistas);

function gruposDe(usuario) {
  const admin = esAdmin(usuario);
  return GRUPOS.map((grupo) => ({ ...grupo, vistas: grupo.vistas.filter((v) => !v.soloAdmin || admin) })).filter(
    (grupo) => grupo.vistas.length > 0
  );
}

// Nombre del vendedor: viene en el token de sesión (el vendedor no tiene
// perfil en /me como el cliente). Una sesión vieja, sin nombre en el token,
// usa la parte del correo antes de la @.
export function nombreDelVendedor(usuario) {
  const nombre = usuario?.nombre || (usuario?.token && decodeToken(usuario.token)?.name);
  if (nombre) return nombre;
  return usuario?.email ? usuario.email.split("@")[0] : "";
}

function iniciales(usuario) {
  const palabras = nombreDelVendedor(usuario).split(/\s+/).filter(Boolean);
  const letras = palabras.length > 1 ? palabras[0][0] + palabras[1][0] : (palabras[0] ?? "").slice(0, 2);
  return letras.toUpperCase() || "V";
}

// El logo de la tienda: el del Navbar sobre fondo claro y, sobre el oscuro
// del menú, su versión con "Auto" en blanco.
function Marca({ oscura = false }) {
  return (
    <img src={oscura ? logoBlanco : logo} alt="AutoBought" className={cn("w-auto object-contain", oscura ? "mx-auto h-12" : "h-10")} />
  );
}

// `avisos`: un número al lado de una sección (por ejemplo, cuántos
// repuestos hay que reponer), como { riesgo: 12 }.
function Menu({ vista, onVista, onTienda, onCerrarSesion, usuario, avisos }) {
  return (
    <div className="flex h-full flex-col">
      {/* Arriba, centrado en el menú. */}
      <div className="px-6 pt-6 pb-6 text-center">
        <Marca oscura />
        {/* El tracking deja espacio a la derecha de la última letra: el pl lo compensa. */}
        <p className="mt-2 pl-[3px] text-[10px] font-bold tracking-[3px] text-gray-500 uppercase">Portal del vendedor</p>
      </div>

      <nav aria-label="Secciones del dashboard" className="flex-1 overflow-y-auto px-3 flex flex-col gap-5">
        {gruposDe(usuario).map((grupo) => (
          <div key={grupo.titulo ?? "inicio"}>
            {grupo.titulo && (
              <p className="px-3 mb-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{grupo.titulo}</p>
            )}
            <ul className="flex flex-col gap-0.5">
              {grupo.vistas.map(({ valor, texto, Icono, enDesarrollo }) => {
                const activa = vista === valor;
                const aviso = avisos?.[valor];
                return (
                  <li key={valor}>
                    <button
                      type="button"
                      onClick={() => onVista(valor)}
                      aria-current={activa ? "page" : undefined}
                      className={cn(
                        "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition",
                        activa
                          ? "bg-orange-500/15 text-orange-400 font-medium"
                          : "text-gray-300 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {activa && (
                        <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-orange-500" aria-hidden="true" />
                      )}
                      <Icono
                        className={cn("size-4 shrink-0", activa ? "text-orange-400" : "text-gray-400 group-hover:text-white")}
                        aria-hidden="true"
                      />
                      <span className="flex-1 truncate">{texto}</span>
                      {aviso > 0 && (
                        <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-red-300">
                          <span className="sr-only">: </span>
                          {aviso}
                        </span>
                      )}
                      {enDesarrollo && (
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
          onClick={onTienda}
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
            {iniciales(usuario)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white">{nombreDelVendedor(usuario)}</p>
            <p className="text-xs text-gray-400">{esAdmin(usuario) ? "Administrador" : "Vendedor"}</p>
          </div>
          <button
            type="button"
            onClick={onCerrarSesion}
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
export default function LayoutVendedor({
  usuario,
  vista,
  onVista,
  onTienda,
  onCerrarSesion,
  avisos,
  antesDelTitulo,
  titulo,
  descripcion,
  acciones,
  barra,
  children,
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Con el menú de celular abierto, Escape lo cierra.
  useEffect(() => {
    if (!menuAbierto) return;
    const alTeclear = (event) => event.key === "Escape" && setMenuAbierto(false);
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [menuAbierto]);

  const elegir = (valor) => {
    setMenuAbierto(false);
    onVista(valor);
  };

  const propsMenu = { vista, onVista: elegir, onTienda, onCerrarSesion, usuario, avisos };

  return (
    <div className="min-h-screen bg-gray-50 text-foreground font-sans antialiased">
      <aside className="hidden lg:block fixed inset-y-0 left-0 z-30 w-64 bg-[#151719]">
        <Menu {...propsMenu} />
      </aside>

      {menuAbierto && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMenuAbierto(false)}
            className="absolute inset-0 bg-gray-900/40"
          />
          <div role="dialog" aria-modal="true" aria-label="Menú" className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-[#151719] shadow-2xl">
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={() => setMenuAbierto(false)}
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
            onClick={() => setMenuAbierto(true)}
            className="-ml-1 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <MenuIcon className="size-5" />
          </button>
          <Marca />
        </header>

        <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-9 max-w-[1320px]">
          {antesDelTitulo}
          {/* Una descripción larga pasa a dos líneas; las acciones quedan a la derecha. */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0 sm:flex-1">
              <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight">{titulo}</h1>
              {descripcion && <p className="text-sm text-muted-foreground mt-1 max-w-3xl">{descripcion}</p>}
            </div>
            {acciones && <div className="flex flex-wrap gap-2 sm:shrink-0">{acciones}</div>}
          </div>
          {barra}
          <div className="mt-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
