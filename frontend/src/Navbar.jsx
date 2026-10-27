import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "./context/CartContext";
import { usePitOpcional } from "./context/PitContext";
import { esVendedor } from "./auth";
import BusquedaCabecera from "./BusquedaCabecera";
import { ID_BUSCADOR_CATALOGO } from "./SearchBar";
import { IconoCerrar, IconoCorazon, IconoLupa, IconoMenu } from "./Iconos";
import logo from "./assets/logo.png";

// Los contadores (carrito y favoritos) rebotan cuando SUBEN (se agregó
// algo). Se compara con el valor anterior durante el render en vez de
// en un efecto; el pulso se usa como key para que la animación se
// repita en cada agregado.
function usePulsoAlSubir(valor) {
  const [valorPrevio, setValorPrevio] = useState(valor);
  const [pulso, setPulso] = useState(0);
  if (valor !== valorPrevio) {
    if (valor > valorPrevio) setPulso((p) => p + 1);
    setValorPrevio(valor);
  }
  return pulso;
}

const claseRebote = (pulso) => (pulso > 0 ? "motion-safe:animate-rebote" : "");

export default function Navbar({
  paginaActual,
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
  cantidadFavoritos = 0,
  usuario,
}) {
  const { cantidadCarrito } = useCart();
  const navigate = useNavigate();
  const vendedor = esVendedor(usuario);
  const pit = usePitOpcional();
  const [menuUsuario, setMenuUsuario] = useState(false);
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);
  // En celular, los links (Home, Marcas...) van en un menú desplegable.
  const [menuAbierto, setMenuAbierto] = useState(false);

  const pulsoCarrito = usePulsoAlSubir(cantidadCarrito);
  const pulsoFavoritos = usePulsoAlSubir(cantidadFavoritos);

  // Pit (el asistente con IA) se abre al costado; sin sesión, primero el
  // login. El vendedor no lo ve.
  const abrirPit = () => (usuario ? pit.abrir() : onLogin());

  const menuRef = useRef(null);
  const navbarRef = useRef(null);
  const botonBusquedaRef = useRef(null);
  const inputBusquedaRef = useRef(null);
  const linksRef = useRef(null);
  // Dónde va el buscador desplegado en pantallas medianas y grandes: desde
  // donde empieza el último link (Pit IA) hasta el borde derecho de la
  // barra, con la flechita debajo de la lupa. En celular (sin links
  // visibles) ocupa toda la barra.
  const [posicionBusqueda, setPosicionBusqueda] = useState(null);

  useLayoutEffect(() => {
    if (!busquedaAbierta) return undefined;

    const medir = () => {
      const nav = navbarRef.current?.getBoundingClientRect();
      const ultimoLink = linksRef.current?.lastElementChild?.getBoundingClientRect();
      const lupa = botonBusquedaRef.current?.getBoundingClientRect();
      if (!nav || !ultimoLink?.width || !lupa) {
        setPosicionBusqueda(null);
        return;
      }
      const left = ultimoLink.left - nav.left;
      setPosicionBusqueda({
        left,
        flechita: lupa.left + lupa.width / 2 - nav.left - left - 6,
      });
    };

    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [busquedaAbierta]);

  useEffect(() => {
    if (busquedaAbierta) inputBusquedaRef.current?.focus();
  }, [busquedaAbierta]);

  // El buscador y el menú de celular se despliegan dentro de la barra: un
  // click fuera de ella los cierra.
  useEffect(() => {
    if (!busquedaAbierta && !menuAbierto) return undefined;

    const manejarClickAfuera = (event) => {
      if (!navbarRef.current?.contains(event.target)) {
        setBusquedaAbierta(false);
        setMenuAbierto(false);
      }
    };

    document.addEventListener("mousedown", manejarClickAfuera);
    return () => document.removeEventListener("mousedown", manejarClickAfuera);
  }, [busquedaAbierta, menuAbierto]);

  const alternarBusqueda = () => {
    setMenuAbierto(false);

    // Si la página ya tiene su buscador (el catálogo), la lupa lleva a ese
    // en vez de abrir otro encima.
    const buscadorDePagina = document.getElementById(ID_BUSCADOR_CATALOGO);
    if (buscadorDePagina) {
      setBusquedaAbierta(false);
      buscadorDePagina.scrollIntoView?.({ behavior: "smooth", block: "center" });
      buscadorDePagina.focus({ preventScroll: true });
      return;
    }

    setBusquedaAbierta((abierta) => !abierta);
  };

  const alternarMenu = () => {
    setBusquedaAbierta(false);
    setMenuAbierto((abierto) => !abierto);
  };

  // Una opción del menú de celular: navega y cierra el menú.
  const irDesdeMenu = (accion) => {
    setMenuAbierto(false);
    accion();
  };

  const cerrarBusqueda = ({ devolverFoco = false } = {}) => {
    setBusquedaAbierta(false);
    if (devolverFoco) botonBusquedaRef.current?.focus();
  };

  /* =====================================================
     CERRAR MENÚ AL HACER CLICK AFUERA
  ====================================================== */

  useEffect(() => {
    const manejarClickAfuera = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setMenuUsuario(false);
      }
    };

    document.addEventListener(
      "mousedown",
      manejarClickAfuera
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        manejarClickAfuera
      );
    };
  }, []);

  /* =====================================================
     CLICK EN BOTÓN DE USUARIO
  ====================================================== */

  const manejarUsuario = () => {
    // Si no hay sesión iniciada
    if (!usuario) {
      setMenuUsuario(false);
      onLogin();
      return;
    }

    // Con sesión, abre/cierra el menú de la cuenta (en todas las
    // páginas, también en las de la cuenta).
    setMenuUsuario((actual) => !actual);
  };

  /* =====================================================
     ACCIÓN DEL MENÚ
  ====================================================== */

  const ejecutarAccion = (accion) => {
    setMenuUsuario(false);

    if (accion) {
      accion();
    }
  };

  return (
    <>
    <nav ref={navbarRef} className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-32px)] max-w-[1085px] h-14 bg-white rounded-xl shadow-xl px-5 md:px-6 flex items-center justify-between">

      {/* =================================================
          LOGO
      ================================================== */}

      <button
        type="button"
        onClick={onHome}
        className="flex items-center cursor-pointer"
      >
        <img
          src={logo}
          alt="AutoBought"
          className="h-10 w-auto object-contain"
        />
      </button>

      {/* =================================================
          NAVEGACIÓN
      ================================================== */}

      <div ref={linksRef} className="hidden md:flex items-center gap-6 lg:gap-9 ml-4 lg:ml-8">

        <button
          type="button"
          onClick={onHome}
          className={`text-sm font-semibold transition ${
            paginaActual === "home"
              ? "text-orange-500"
              : "text-gray-800 hover:text-orange-500"
          }`}
        >
          Home
        </button>

        <button
          type="button"
          onClick={onMarcas}
          className={`text-sm font-semibold transition ${
            paginaActual === "marcas"
              ? "text-orange-500"
              : "text-gray-800 hover:text-orange-500"
          }`}
        >
          Marcas
        </button>

        <button
          type="button"
          onClick={() => onCatalogo()}
          className={`text-sm font-semibold transition ${
            paginaActual === "catalogo" ||
            paginaActual === "detalle"
              ? "text-orange-500"
              : "text-gray-800 hover:text-orange-500"
          }`}
        >
          Repuestos
        </button>

        {pit && !vendedor && (
          <button
            type="button"
            onClick={abrirPit}
            className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 hover:text-orange-500 transition"
          >
            Pit IA
            <span className="text-[10px] font-black bg-orange-500 text-white rounded-full px-1.5 py-0.5">NUEVO</span>
          </button>
        )}

      </div>

      {/* =================================================
          ICONOS DERECHA
      ================================================== */}

      <div className="flex items-center gap-4 md:gap-5 text-gray-700">

        {/* El buscador se despliega debajo de la barra (ver posicionBusqueda). */}
        <div className="flex">
          <button
            ref={botonBusquedaRef}
            type="button"
            aria-label={busquedaAbierta ? "Cerrar búsqueda" : "Abrir búsqueda"}
            aria-expanded={busquedaAbierta}
            aria-controls="navbar-search-panel"
            onClick={alternarBusqueda}
            className={`transition ${busquedaAbierta ? "text-orange-500" : "hover:text-orange-500"}`}
          >
            <IconoLupa className="h-5 w-5" />
          </button>

          {busquedaAbierta && (
            <div
              id="navbar-search-panel"
              role="search"
              className="absolute left-0 right-0 top-[calc(100%+8px)] rounded-lg shadow-2xl"
              style={posicionBusqueda ? { left: posicionBusqueda.left } : undefined}
            >
              {/* Flechita que apunta a la lupa. */}
              {posicionBusqueda && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1.5 w-3 h-3 rotate-45 bg-white border-l border-t border-gray-100"
                  style={{ left: posicionBusqueda.flechita }}
                />
              )}
              <BusquedaCabecera
                inputRef={inputBusquedaRef}
                onSearch={() => cerrarBusqueda()}
                onEscape={() => cerrarBusqueda({ devolverFoco: true })}
              />
            </div>
          )}
        </div>

        {/* =================================================
            USUARIO
        ================================================== */}

        <div
          ref={menuRef}
          className="relative"
        >

          <button
            type="button"
            onClick={manejarUsuario}
            className={`transition ${
              paginaActual === "login" ||
              paginaActual === "perfil" ||
              paginaActual === "direcciones" ||
              paginaActual === "metodosPago" ||
              paginaActual === "historialCompras" ||
              paginaActual === "dashboard"
                ? "text-orange-500"
                : "hover:text-orange-500"
            }`}
            title={
              usuario
                ? "Mi cuenta"
                : "Iniciar sesión"
            }
          >
            <svg
              className="w-[20px] h-[20px]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </button>

          {/* =================================================
              MENÚ DE USUARIO
          ================================================== */}

          {usuario &&
            menuUsuario &&
            vendedor && (
              <div className="absolute right-0 top-9 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">

                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-black text-gray-900">
                    Vendedor
                  </p>

                  <p className="text-xs text-gray-400 mt-1 truncate">
                    {usuario.email || ""}
                  </p>
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    onClick={() =>
                      ejecutarAccion(() => navigate("/dashboard"))
                    }
                    className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-orange-500 transition"
                  >
                    Dashboard
                  </button>
                </div>

                <div className="border-t border-gray-100 p-1">
                  <button
                    type="button"
                    onClick={() =>
                      ejecutarAccion(onCerrarSesion)
                    }
                    className="w-full text-left px-4 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50 transition"
                  >
                    Cerrar sesión
                  </button>
                </div>

              </div>
            )}

          {usuario &&
            menuUsuario &&
            !vendedor && (
              <div className="absolute right-0 top-9 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">

                {/* CABECERA */}

                <div className="px-4 py-3 border-b border-gray-100">

                  <p className="text-sm font-black text-gray-900">
                    {usuario.nombre || "Usuario"}{" "}
                    {usuario.apellido || ""}
                  </p>

                  <p className="text-xs text-gray-400 mt-1 truncate">
                    {usuario.email || ""}
                  </p>

                </div>

                {/* OPCIONES */}

                <div className="py-1">

                  <button
                    type="button"
                    onClick={() =>
                      ejecutarAccion(onPerfil)
                    }
                    className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-orange-500 transition"
                  >
                    Mi perfil
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      ejecutarAccion(onDirecciones)
                    }
                    className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-orange-500 transition"
                  >
                    Direcciones
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      ejecutarAccion(onMetodosPago)
                    }
                    className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-orange-500 transition"
                  >
                    Métodos de pago
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      ejecutarAccion(onHistorial)
                    }
                    className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-orange-500 transition"
                  >
                    Historial de compras
                  </button>

                </div>

                {/* CERRAR SESIÓN */}

                <div className="border-t border-gray-100 p-1">

                  <button
                    type="button"
                    onClick={() =>
                      ejecutarAccion(onCerrarSesion)
                    }
                    className="w-full text-left px-4 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50 transition"
                  >
                    Cerrar sesión
                  </button>

                </div>

              </div>
            )}

        </div>

        {/* =================================================
            FAVORITOS
        ================================================== */}

        {!vendedor && (
        <button
          type="button"
          onClick={onFavoritos}
          className={`relative transition ${
            paginaActual === "favoritos"
              ? "text-orange-500"
              : "hover:text-orange-500"
          }`}
          title="Favoritos"
        >
          <IconoCorazon
            lleno={paginaActual === "favoritos"}
            className="w-5 h-5"
          />

          {cantidadFavoritos > 0 && (
            <span
              key={pulsoFavoritos}
              className={`absolute -top-2 -right-2 min-w-4 h-4 px-1 bg-orange-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold ${claseRebote(pulsoFavoritos)}`}
            >
              {cantidadFavoritos}
            </span>
          )}
        </button>
        )}

        {/* =================================================
            CARRITO
        ================================================== */}

        {!vendedor && (
        <button
          type="button"
          onClick={onCarrito}
          className={`relative transition ${
            paginaActual === "carrito"
              ? "text-orange-500"
              : "hover:text-orange-500"
          }`}
          title="Carrito"
        >
          <svg
            className="w-[20px] h-[20px]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
              d="M3 3h2l2.4 11.5a2 2 0 002 1.5h7.8a2 2 0 001.9-1.4L21 7H6"
            />

            <circle
              cx="10"
              cy="20"
              r="1.2"
            />

            <circle
              cx="18"
              cy="20"
              r="1.2"
            />
          </svg>

          {cantidadCarrito > 0 && (
            <span
              key={pulsoCarrito}
              className={`absolute -top-2 -right-2 min-w-4 h-4 px-1 bg-orange-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold ${claseRebote(pulsoCarrito)}`}
            >
              {cantidadCarrito}
            </span>
          )}
        </button>
        )}

        {/* =================================================
            MENÚ DE CELULAR
        ================================================== */}

        <button
          type="button"
          aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuAbierto}
          aria-controls="navbar-menu-celular"
          onClick={alternarMenu}
          className={`md:hidden transition ${menuAbierto ? "text-orange-500" : "hover:text-orange-500"}`}
        >
          {menuAbierto ? <IconoCerrar className="h-5 w-5" /> : <IconoMenu className="h-5 w-5" />}
        </button>

      </div>

      {menuAbierto && (
        <div
          id="navbar-menu-celular"
          className="md:hidden absolute left-0 right-0 top-[calc(100%+8px)] bg-white rounded-xl shadow-2xl border border-gray-100 p-2"
        >
          {[
            { texto: "Home", activo: paginaActual === "home", ir: onHome },
            { texto: "Marcas", activo: paginaActual === "marcas", ir: onMarcas },
            {
              texto: "Repuestos",
              activo: paginaActual === "catalogo" || paginaActual === "detalle",
              ir: () => onCatalogo(),
            },
          ].map((opcion) => (
            <button
              key={opcion.texto}
              type="button"
              onClick={() => irDesdeMenu(opcion.ir)}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm font-semibold transition ${
                opcion.activo ? "text-orange-500 bg-orange-50" : "text-gray-800 hover:bg-gray-50"
              }`}
            >
              {opcion.texto}
            </button>
          ))}
          {pit && !vendedor && (
            <button
              type="button"
              onClick={() => irDesdeMenu(abrirPit)}
              className="w-full flex items-center gap-1.5 text-left px-4 py-3 rounded-lg text-sm font-semibold text-gray-800 hover:bg-gray-50 transition"
            >
              Pit IA
              <span className="text-[10px] font-black bg-orange-500 text-white rounded-full px-1.5 py-0.5">NUEVO</span>
            </button>
          )}
        </div>
      )}

    </nav>
    </>
  );
}
