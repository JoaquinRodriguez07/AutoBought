import { useState, useRef, useEffect } from "react";
import { useCart } from "./context/CartContext";

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
  const [menuUsuario, setMenuUsuario] = useState(false);

  const menuRef = useRef(null);

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

    // Si estamos en Perfil, no abrimos el menú
    if (paginaActual === "perfil") {
      setMenuUsuario(false);
      return;
    }

    // Si hay sesión y no estamos en Perfil,
    // abrir/cerrar menú
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
    <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-32px)] max-w-[1085px] h-14 bg-white rounded-xl shadow-xl px-5 md:px-6 flex items-center justify-between">

      {/* =================================================
          LOGO
      ================================================== */}

      <button
        type="button"
        onClick={onHome}
        className="flex items-center cursor-pointer"
      >
        <img
          src="/src/assets/logo.png"
          alt="AutoBought"
          className="h-10 w-auto object-contain"
        />
      </button>

      {/* =================================================
          NAVEGACIÓN
      ================================================== */}

      <div className="hidden md:flex items-center gap-9 ml-8">

        <button
          type="button"
          onClick={onHome}
          className={`text-[11px] font-semibold transition ${
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
          className={`text-[11px] font-semibold transition ${
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
          className={`text-[11px] font-semibold transition ${
            paginaActual === "catalogo" ||
            paginaActual === "detalle"
              ? "text-orange-500"
              : "text-gray-800 hover:text-orange-500"
          }`}
        >
          Repuestos
        </button>

      </div>

      {/* =================================================
          ICONOS DERECHA
      ================================================== */}

      <div className="flex items-center gap-5 text-gray-700">

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
              paginaActual === "historialCompras"
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
            paginaActual !== "perfil" && (
              <div className="absolute right-0 top-9 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">

                {/* CABECERA */}

                <div className="px-4 py-3 border-b border-gray-100">

                  <p className="text-[10px] font-black text-gray-900">
                    {usuario.nombre || "Usuario"}{" "}
                    {usuario.apellido || ""}
                  </p>

                  <p className="text-[8px] text-gray-400 mt-1 truncate">
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
                    className="w-full text-left px-4 py-2.5 text-[9px] font-semibold text-gray-700 hover:bg-gray-50 hover:text-orange-500 transition"
                  >
                    Mi perfil
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      ejecutarAccion(onDirecciones)
                    }
                    className="w-full text-left px-4 py-2.5 text-[9px] font-semibold text-gray-700 hover:bg-gray-50 hover:text-orange-500 transition"
                  >
                    Direcciones
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      ejecutarAccion(onMetodosPago)
                    }
                    className="w-full text-left px-4 py-2.5 text-[9px] font-semibold text-gray-700 hover:bg-gray-50 hover:text-orange-500 transition"
                  >
                    Métodos de pago
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      ejecutarAccion(onHistorial)
                    }
                    className="w-full text-left px-4 py-2.5 text-[9px] font-semibold text-gray-700 hover:bg-gray-50 hover:text-orange-500 transition"
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
                    className="w-full text-left px-4 py-2.5 text-[9px] font-bold text-red-500 hover:bg-red-50 transition"
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
          <span className="text-[21px] leading-none">
            {paginaActual === "favoritos"
              ? "♥"
              : "♡"}
          </span>

          {cantidadFavoritos > 0 && (
            <span className="absolute -top-2 -right-2 min-w-4 h-4 px-1 bg-orange-500 text-white rounded-full text-[8px] flex items-center justify-center font-bold">
              {cantidadFavoritos}
            </span>
          )}
        </button>

        {/* =================================================
            CARRITO
        ================================================== */}

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
            <span className="absolute -top-2 -right-2 min-w-4 h-4 px-1 bg-orange-500 text-white rounded-full text-[8px] flex items-center justify-center font-bold">
              {cantidadCarrito}
            </span>
          )}
        </button>

      </div>

    </nav>
  );
}