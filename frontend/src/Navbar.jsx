// La barra de navegación de la tienda.

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "./context/CartContext";
import { useOrders } from "./context/OrdersContext";
import { useOptionalPit } from "./context/PitContext";
import { isSeller } from "./auth";
import HeaderSearch from "./HeaderSearch";
import { CATALOG_SEARCH_ID } from "./SearchBar";
import { TruckIcon, CloseIcon, HeartIcon, SearchIcon, MenuIcon } from "./Icons";
import logo from "./assets/logo.png";

// Los contadores (carrito y favoritos) rebotan cuando SUBEN (se agregó
// algo). Se compara con el valor anterior durante el render en vez de
// en un efecto; el pulso se usa como key para que la animación se
// repita en cada agregado.
function usePulseOnIncrease(rawValue) {
  const [previousValue, setPreviousValue] = useState(rawValue);
  const [pulse, setPulse] = useState(0);
  if (rawValue !== previousValue) {
    if (rawValue > previousValue) setPulse((p) => p + 1);
    setPreviousValue(rawValue);
  }
  return pulse;
}

const bounceClass = (pulse) => (pulse > 0 ? "motion-safe:animate-rebote" : "");

export default function Navbar({
  currentPage,
  onHome,
  onCatalogo,
  onLogin,
  onBrands,
  onCart,
  onFavorites,
  onCloseSession,
  onDeleteAccount,
  favoritesQuantity = 0,
  sessionUser,
}) {
  const { cartQuantity } = useCart();
  const { inProgress } = useOrders();
  const quantityOrdersInCurso = inProgress.length;
  const navigate = useNavigate();
  const seller = isSeller(sessionUser);
  const pit = useOptionalPit();
  const [userMenu, setUserMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // En celular, los links (Home, Marcas...) van en un menú desplegable.
  const [openMenu, setOpenMenu] = useState(false);

  const pulseCart = usePulseOnIncrease(cartQuantity);
  const pulseFavorites = usePulseOnIncrease(favoritesQuantity);

  // Pit (el asistente con IA) se abre al costado; sin sesión, primero el
  // login. El vendedor no lo ve.
  const openPit = () => (sessionUser ? pit.open() : onLogin());

  const menuRef = useRef(null);
  const navbarRef = useRef(null);
  const buttonSearchRef = useRef(null);
  const inputSearchRef = useRef(null);
  const linksRef = useRef(null);
  // Dónde va el buscador desplegado en pantallas medianas y grandes: desde
  // donde empieza el último link (Pit IA) hasta el borde derecho de la
  // barra, con la flechita debajo de la lupa. En celular (sin links
  // visibles) ocupa toda la barra.
  const [positionSearch, setPositionSearch] = useState(null);

  useLayoutEffect(() => {
    if (!searchOpen) return undefined;

    const medir = () => {
      const nav = navbarRef.current?.getBoundingClientRect();
      const lastLink = linksRef.current?.lastElementChild?.getBoundingClientRect();
      const lupa = buttonSearchRef.current?.getBoundingClientRect();
      if (!nav || !lastLink?.width || !lupa) {
        setPositionSearch(null);
        return;
      }
      const left = lastLink.left - nav.left;
      setPositionSearch({
        left,
        smallArrow: lupa.left + lupa.width / 2 - nav.left - left - 6,
      });
    };

    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [searchOpen]);

  useEffect(() => {
    if (searchOpen) inputSearchRef.current?.focus();
  }, [searchOpen]);

  // El buscador y el menú de celular se despliegan dentro de la barra: un
  // click fuera de ella los cierra.
  useEffect(() => {
    if (!searchOpen && !openMenu) return undefined;

    const handleClickAfuera = (event) => {
      if (!navbarRef.current?.contains(event.target)) {
        setSearchOpen(false);
        setOpenMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickAfuera);
    return () => document.removeEventListener("mousedown", handleClickAfuera);
  }, [searchOpen, openMenu]);

  const toggleSearch = () => {
    setOpenMenu(false);

    // Si la página ya tiene su buscador (el catálogo), la lupa lleva a ese
    // en vez de abrir otro encima.
    const pageSearcher = document.getElementById(CATALOG_SEARCH_ID);
    if (pageSearcher) {
      setSearchOpen(false);
      pageSearcher.scrollIntoView?.({ behavior: "smooth", block: "center" });
      pageSearcher.focus({ preventScroll: true });
      return;
    }

    setSearchOpen((isShown) => !isShown);
  };

  const toggleMenu = () => {
    setSearchOpen(false);
    setOpenMenu((isOpen) => !isOpen);
  };

  // Una opción del menú de celular: navega y cierra el menú.
  const goToFromMenu = (action) => {
    setOpenMenu(false);
    action();
  };

  const closeSearch = ({ devolverFoco = false } = {}) => {
    setSearchOpen(false);
    if (devolverFoco) buttonSearchRef.current?.focus();
  };

  /* =====================================================
     CERRAR MENÚ AL HACER CLICK AFUERA
  ====================================================== */

  useEffect(() => {
    const handleClickAfuera = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setUserMenu(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleClickAfuera
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickAfuera
      );
    };
  }, []);

  /* =====================================================
     CLICK EN BOTÓN DE USUARIO
  ====================================================== */

  const handleUser = () => {
    // Si no hay sesión iniciada
    if (!sessionUser) {
      setUserMenu(false);
      onLogin();
      return;
    }

    // Con sesión, abre/cierra el menú de la cuenta (en todas las
    // páginas, también en las de la cuenta).
    setUserMenu((current) => !current);
  };

  /* =====================================================
     ACCIÓN DEL MENÚ
  ====================================================== */

  const runAction = (action) => {
    setUserMenu(false);

    if (action) {
      action();
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
            currentPage === "home"
              ? "text-orange-500"
              : "text-gray-800 hover:text-orange-500"
          }`}
        >
          Inicio
        </button>

        <button
          type="button"
          onClick={onBrands}
          className={`text-sm font-semibold transition ${
            currentPage === "brands"
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
            currentPage === "catalogo" ||
            currentPage === "detalle"
              ? "text-orange-500"
              : "text-gray-800 hover:text-orange-500"
          }`}
        >
          Repuestos
        </button>

        {pit && !seller && (
          <button
            type="button"
            onClick={openPit}
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
            ref={buttonSearchRef}
            type="button"
            aria-label={searchOpen ? "Cerrar búsqueda" : "Abrir búsqueda"}
            aria-expanded={searchOpen}
            aria-controls="navbar-search-panel"
            onClick={toggleSearch}
            className={`transition ${searchOpen ? "text-orange-500" : "hover:text-orange-500"}`}
          >
            <SearchIcon className="h-5 w-5" />
          </button>

          {searchOpen && (
            <div
              id="navbar-search-panel"
              role="search"
              className="absolute left-0 right-0 top-[calc(100%+8px)] rounded-lg shadow-2xl"
              style={positionSearch ? { left: positionSearch.left } : undefined}
            >
              {/* Flechita que apunta a la lupa. */}
              {positionSearch && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1.5 w-3 h-3 rotate-45 bg-white border-l border-t border-gray-100"
                  style={{ left: positionSearch.smallArrow }}
                />
              )}
              <HeaderSearch
                inputRef={inputSearchRef}
                onSearch={() => closeSearch()}
                onEscape={() => closeSearch({ devolverFoco: true })}
              />
            </div>
          )}
        </div>

        {/* Orden: buscar, favoritos, pedidos, cuenta y carrito. En
            celular solo quedan buscar, carrito y el menú: favoritos,
            pedidos y la cuenta van adentro del menú (ver abajo). */}

        {/* =================================================
            FAVORITOS
        ================================================== */}

        {!seller && (
        <button
          type="button"
          onClick={onFavorites}
          className={`relative hidden md:block transition ${
            currentPage === "favorites"
              ? "text-orange-500"
              : "hover:text-orange-500"
          }`}
          title="Favoritos"
        >
          <HeartIcon
            full={currentPage === "favorites"}
            className="w-5 h-5"
          />

          {favoritesQuantity > 0 && (
            <span
              key={pulseFavorites}
              className={`absolute -top-2 -right-2 min-w-4 h-4 px-1 bg-orange-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold ${bounceClass(pulseFavorites)}`}
            >
              {favoritesQuantity}
            </span>
          )}
        </button>
        )}

        {/* =================================================
            MIS PEDIDOS
            A la vista (no solo en el menú de la cuenta): un clic
            para ver cómo viene lo que compraste. Como favoritos y el
            carrito, se ve también sin sesión (lleva al login).
        ================================================== */}

        {!seller && (
        <button
          type="button"
          onClick={sessionUser ? () => navigate("/pedidos") : onLogin}
          className={`relative hidden md:block transition ${
            currentPage === "orders"
              ? "text-orange-500"
              : "hover:text-orange-500"
          }`}
          title="Mis compras"
          aria-label={
            quantityOrdersInCurso > 0
              ? `Mis compras (${quantityOrdersInCurso} en curso)`
              : "Mis compras"
          }
        >
          <TruckIcon className="w-5 h-5" />

          {quantityOrdersInCurso > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-2 -right-2 min-w-4 h-4 px-1 bg-orange-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold"
            >
              {quantityOrdersInCurso}
            </span>
          )}
        </button>
        )}

        {/* =================================================
            USUARIO
        ================================================== */}

        <div
          ref={menuRef}
          className="relative hidden md:flex"
        >

          <button
            type="button"
            onClick={handleUser}
            className={`flex items-center transition ${
              currentPage === "login" ||
              currentPage === "profile" ||
              currentPage === "addresses" ||
              currentPage === "metodosPago" ||
              currentPage === "historialCompras" ||
              currentPage === "dashboard"
                ? "text-orange-500"
                : "hover:text-orange-500"
            }`}
            title={
              sessionUser
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

          {sessionUser &&
            userMenu &&
            seller && (
              <div className="absolute right-0 top-9 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">

                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-black text-gray-900">
                    Vendedor
                  </p>

                  <p className="text-xs text-gray-400 mt-1 truncate">
                    {sessionUser.email || ""}
                  </p>
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    onClick={() =>
                      runAction(() => navigate("/dashboard"))
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
                      runAction(onCloseSession)
                    }
                    className="w-full text-left px-4 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50 transition"
                  >
                    Cerrar sesión
                  </button>
                </div>

              </div>
            )}

          {sessionUser &&
            userMenu &&
            !seller && (
              <div className="absolute right-0 top-9 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">

                {/* CABECERA */}

                <div className="px-4 py-3 border-b border-gray-100">

                  <p className="text-sm font-black text-gray-900">
                    {sessionUser.displayName || "Usuario"}{" "}
                    {sessionUser.lastName || ""}
                  </p>

                  <p className="text-xs text-gray-400 mt-1 truncate">
                    {sessionUser.email || ""}
                  </p>

                </div>

                {/* OPCIONES */}

                <div className="py-1">

                  {/* Una sola entrada para las compras (en curso y
                      anteriores van en pestañas, dentro). */}
                  <button
                    type="button"
                    onClick={() =>
                      runAction(() => navigate("/pedidos"))
                    }
                    className="w-full flex items-center justify-between text-left px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-orange-500 transition"
                  >
                    Mis compras
                    {quantityOrdersInCurso > 0 && (
                      <span className="text-xs font-black bg-orange-500 text-white rounded-full px-2 py-0.5">
                        {quantityOrdersInCurso} en curso
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      runAction(() => navigate("/perfil"))
                    }
                    className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-orange-500 transition"
                  >
                    Mis datos
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      runAction(() => navigate("/direcciones"))
                    }
                    className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-orange-500 transition"
                  >
                    Direcciones
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      runAction(() => navigate("/cuenta"))
                    }
                    className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-orange-500 transition"
                  >
                    Ver toda mi cuenta
                  </button>


                </div>

                {/* CERRAR SESIÓN */}

                <div className="border-t border-gray-100 p-1">

                  <button
                    type="button"
                    onClick={() =>
                      runAction(onCloseSession)
                    }
                    className="w-full text-left px-4 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50 transition"
                  >
                    Cerrar sesión
                  </button>
                  {!seller && onDeleteAccount && (
                    <button
                      type="button"
                      onClick={() => runAction(onDeleteAccount)}
                      className="w-full text-left px-4 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50 transition"
                    >
                      Borrar mi cuenta
                    </button>
                  )}

                </div>

              </div>
            )}

        </div>

        {/* =================================================
            CARRITO
            Último a la derecha, como en casi todas las tiendas.
        ================================================== */}

        {!seller && (
        <button
          type="button"
          onClick={onCart}
          className={`relative transition ${
            currentPage === "cartState"
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

          {cartQuantity > 0 && (
            <span
              key={pulseCart}
              className={`absolute -top-2 -right-2 min-w-4 h-4 px-1 bg-orange-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold ${bounceClass(pulseCart)}`}
            >
              {cartQuantity}
            </span>
          )}
        </button>
        )}

        {/* =================================================
            MENÚ DE CELULAR
        ================================================== */}

        <button
          type="button"
          aria-label={openMenu ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={openMenu}
          aria-controls="navbar-menu-celular"
          onClick={toggleMenu}
          className={`relative md:hidden transition ${openMenu ? "text-orange-500" : "hover:text-orange-500"}`}
        >
          {openMenu ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          {/* Hay pedidos en curso (están adentro del menú). */}
          {!openMenu && quantityOrdersInCurso > 0 && (
            <span aria-hidden="true" className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 ring-2 ring-white" />
          )}
        </button>

      </div>

      {openMenu && (
        <div
          id="navbar-menu-celular"
          className="md:hidden absolute left-0 right-0 top-[calc(100%+8px)] bg-white rounded-xl shadow-2xl border border-gray-100 p-2"
        >
          {[
            { texto: "Inicio", active: currentPage === "home", goTo: onHome },
            { texto: "Marcas", active: currentPage === "brands", goTo: onBrands },
            {
              texto: "Repuestos",
              active: currentPage === "catalogo" || currentPage === "detalle",
              goTo: () => onCatalogo(),
            },
          ].map((option) => (
            <button
              key={option.texto}
              type="button"
              onClick={() => goToFromMenu(option.goTo)}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm font-semibold transition ${
                option.active ? "text-orange-500 bg-orange-50" : "text-gray-800 hover:bg-gray-50"
              }`}
            >
              {option.texto}
            </button>
          ))}
          {pit && !seller && (
            <button
              type="button"
              onClick={() => goToFromMenu(openPit)}
              className="w-full flex items-center gap-1.5 text-left px-4 py-3 rounded-lg text-sm font-semibold text-gray-800 hover:bg-gray-50 transition"
            >
              Pit IA
              <span className="text-[10px] font-black bg-orange-500 text-white rounded-full px-1.5 py-0.5">NUEVO</span>
            </button>
          )}

          {/* En celular, lo de la cuenta va acá (en la barra no entra). */}
          <div className="border-t border-gray-100 mt-2 pt-2">
            {(seller
              ? [
                  { texto: "Dashboard", active: currentPage === "dashboard", goTo: () => navigate("/dashboard") },
                ]
              : [
                  {
                    texto: "Mis compras",
                    active: currentPage === "orders",
                    goTo: sessionUser ? () => navigate("/pedidos") : onLogin,
                    number: quantityOrdersInCurso,
                    details: "en curso",
                  },
                  { texto: "Favoritos", active: currentPage === "favorites", goTo: onFavorites, number: favoritesQuantity },
                  {
                    texto: sessionUser ? "Mi cuenta" : "Iniciar sesión",
                    active: currentPage === "profile" || currentPage === "login",
                    goTo: sessionUser ? () => navigate("/cuenta") : onLogin,
                  },
                ]
            ).map((option) => (
              <button
                key={option.texto}
                type="button"
                onClick={() => goToFromMenu(option.goTo)}
                className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-lg text-sm font-semibold transition ${
                  option.active ? "text-orange-500 bg-orange-50" : "text-gray-800 hover:bg-gray-50"
                }`}
              >
                {option.texto}
                {option.number > 0 && (
                  <span className="text-[10px] font-black bg-orange-500 text-white rounded-full px-1.5 py-0.5">
                    {option.number}
                    {option.details ? ` ${option.details}` : ""}
                  </span>
                )}
              </button>
            ))}
            {sessionUser && (
              <>
                <button
                  type="button"
                  onClick={() => goToFromMenu(onCloseSession)}
                  className="w-full text-left px-4 py-3 rounded-lg text-sm font-bold text-red-500 hover:bg-red-50 transition"
                >
                  Cerrar sesión
                </button>
                {!seller && onDeleteAccount && (
                  <button
                    type="button"
                    onClick={() => goToFromMenu(onDeleteAccount)}
                    className="w-full text-left px-4 py-3 rounded-lg text-sm font-bold text-red-500 hover:bg-red-50 transition"
                  >
                    Borrar mi cuenta
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

    </nav>
    </>
  );
}
