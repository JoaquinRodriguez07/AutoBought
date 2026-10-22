import Navbar from "./Navbar";
import {
  IconoCaja,
  IconoSalir,
  IconoTarjeta,
  IconoUbicacion,
  IconoUsuario,
} from "./Iconos";

/**
 * CuentaLayout
 * ==========================================
 * El armado común de "Mi cuenta" (perfil, direcciones, métodos de pago e
 * historial): la franja de arriba, el menú de la izquierda con la
 * sección actual marcada y "Cerrar sesión" al final. Cada página solo
 * pone su título y su contenido.
 *
 * Props:
 *  - seccion     ("perfil" | "direcciones" | "metodos-pago" | "historial")
 *  - titulo      título de la sección
 *  - descripcion texto corto debajo del título (opcional)
 *  - accion      botón a la derecha del título, ej. "Agregar" (opcional)
 *  - usuario, cantidadFavoritos y los on* de navegación, que también
 *    usa la Navbar (App.jsx los pasa en propsNavbar).
 */
export default function CuentaLayout({
  seccion,
  titulo,
  descripcion,
  accion,
  children,
  usuario,
  cantidadFavoritos,
  onHome,
  onCatalogo,
  onLogin,
  onMarcas,
  onCarrito,
  onFavoritos,
  onPerfil,
  onDirecciones,
  onMetodosPago,
  onHistorial,
  onCerrarSesion,
}) {
  const secciones = [
    { clave: "perfil", texto: "Información personal", Icono: IconoUsuario, ir: onPerfil },
    { clave: "direcciones", texto: "Direcciones", Icono: IconoUbicacion, ir: onDirecciones },
    { clave: "metodos-pago", texto: "Métodos de pago", Icono: IconoTarjeta, ir: onMetodosPago },
    { clave: "historial", texto: "Historial de compras", Icono: IconoCaja, ir: onHistorial },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">

      <Navbar
        paginaActual="perfil"
        usuario={usuario}
        cantidadFavoritos={cantidadFavoritos}
        onHome={onHome}
        onCatalogo={onCatalogo}
        onLogin={onLogin}
        onMarcas={onMarcas}
        onCarrito={onCarrito}
        onFavoritos={onFavoritos}
        onPerfil={onPerfil}
        onDirecciones={onDirecciones}
        onMetodosPago={onMetodosPago}
        onHistorial={onHistorial}
        onCerrarSesion={onCerrarSesion}
      />

      <main className="pt-[88px]">

        {/* ENCABEZADO */}

        <section className="bg-[#f5f5f5] px-5 md:px-10 py-8">
          <div className="max-w-[1100px] mx-auto">
            <p className="text-xs text-gray-400">
              Inicio › Mi cuenta › {titulo}
            </p>

            <div className="flex items-center gap-4 mt-4">
              <span
                aria-hidden="true"
                className="w-14 h-14 shrink-0 rounded-full bg-orange-500 text-white text-2xl font-black flex items-center justify-center"
              >
                {(usuario?.nombre || "U").charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-black">
                  {usuario?.nombre ? `Hola, ${usuario.nombre.split(" ")[0]}` : "Mi cuenta"}
                </h1>
                {usuario?.email && (
                  <p className="text-sm text-gray-500 mt-0.5 truncate">{usuario.email}</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 md:px-10 py-8">
          <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-8">

            {/* MENÚ */}
            {/* En pantallas chicas es una fila que se desliza. */}

            <nav aria-label="Mi cuenta" className="lg:self-start">
              <ul className="flex lg:flex-col gap-1 overflow-x-auto -mx-5 px-5 lg:mx-0 lg:px-0 pb-1 lg:pb-0">
                {secciones.map(({ clave, texto, Icono, ir }) => {
                  const actual = clave === seccion;
                  return (
                    <li key={clave} className="shrink-0">
                      <button
                        type="button"
                        onClick={actual ? undefined : ir}
                        aria-current={actual ? "page" : undefined}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-left whitespace-nowrap transition ${
                          actual
                            ? "bg-orange-50 text-orange-600 font-bold"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <Icono className="w-4 h-4 shrink-0" />
                        {texto}
                      </button>
                    </li>
                  );
                })}

                <li className="shrink-0 lg:border-t lg:border-gray-100 lg:mt-3 lg:pt-3">
                  <button
                    type="button"
                    onClick={onCerrarSesion}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-left whitespace-nowrap text-red-600 hover:bg-red-50 transition"
                  >
                    <IconoSalir className="w-4 h-4 shrink-0" />
                    Cerrar sesión
                  </button>
                </li>
              </ul>
            </nav>

            {/* CONTENIDO */}

            <div className="min-w-0">
              <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-black">{titulo}</h2>
                  {descripcion && (
                    <p className="text-sm text-gray-500 mt-1">{descripcion}</p>
                  )}
                </div>
                {accion}
              </div>

              {children}
            </div>

          </div>
        </section>

      </main>
    </div>
  );
}
