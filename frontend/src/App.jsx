// La aplicación: rutas, sesión, providers y la barra de navegación.

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { onSessionSaved, isSeller, saveSession, getSession, isSessionValid } from "./auth";
import { useSessionRenewal } from "./useSessionRenewal";
import {
  onInvalidSession,
  addStockAlert,
  addFavoriteApi,
  getStockAlerts,
  getFavorites,
  removeStockAlert,
  removeFavoriteApi,
} from "./api";
import { useCart } from "./context/CartContext";
import { useVehicle } from "./context/VehicleContext";
import { slugifyProduct } from "./productSlug";

import Home from "./Home";
import Login from "./Login";
import Register from "./Register";
import Profile from "./Profile";
import Addresses from "./Addresses";
import PurchaseHistory from "./PurchaseHistory";
import MyOrders from "./MyOrders";
import AccountHome from "./AccountHome";
import Notifications from "./Notifications";
import Security from "./Security";
import PaymentResult from "./PaymentResult";
import Catalog from "./Catalog";
import ProductDetail from "./ProductDetail";
import Brands from "./Brands";
import CartPage from "./CartPage";
import Favorites from "./Favorites";
import PitPanel from "./PitPanel";
import { usePit } from "./context/PitContext";
import { useOrders } from "./context/OrdersContext";
import ProtectedRoute from "./ProtectedRoute";
import Footer from "./Footer";
import EmployeeRoute from "./EmployeeRoute";
import NotFoundPage from "./NotFoundPage";
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";
import VerifyEmail from "./VerifyEmail";
import VerifyEmailNotice from "./VerifyEmailNotice";
import Unsubscribe from "./Unsubscribe";

// El dashboard (con Recharts y Base UI) se descarga recién cuando entra un
// vendedor: un cliente nunca baja ese código.
const Dashboard = lazy(() => import("./dashboard/Dashboard"));
const SellerPartDetail = lazy(() => import("./dashboard/SellerPartDetail"));
const SellerOrderDetail = lazy(() => import("./dashboard/SellerOrderDetail"));

const dashboardLoading = (
  <p className="pt-[140px] text-center text-sm text-gray-400">Cargando dashboard…</p>
);

const ROUTES_WITHOUT_FOOTER = [
  "/login",
  "/registro",
  "/recuperar-password",
  "/restablecer-password",
  "/verificar-correo",
  "/baja-mails",
];

function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Al pasar a otra página se arranca desde arriba (sin esto, el
  // navegador conserva el scroll de la página anterior).
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);
  const { loadCart, clearCartLocal } = useCart();
  const { activateVehicle } = useVehicle();
  const { forget: forgetChatPit } = usePit();
  const { reload: reloadOrders, clean: clearOrders } = useOrders();

  // Al volver al inicio se actualizan los pedidos en curso (el aviso del
  // banner y el número de la barra): un pedido pudo cambiar de estado.
  useEffect(() => {
    if (pathname === "/") reloadOrders();
  }, [pathname, reloadOrders]);


  // null = sin filtro de categoría (el catálogo muestra todos los
  // repuestos). Los nombres de categoría los define el backend
  // (GET /api/v1/parts/categories), no el frontend.
  const [categoryCatalogo, setCategoryCatalogo] =
    useState(null);

  /* =====================================================
     SESIÓN
  ====================================================== */

  const [sessionUser, setUser] = useState(() => {
    const session = getSession();
    return isSessionValid(session) ? session : null;
  });

  /* =====================================================
     FAVORITOS
  ====================================================== */

  const [favorites, setFavorites] = useState([]);

  // El efecto depende de quién es el usuario y de si hay token, NO del
  // valor del token: renovarlo cada ~55 minutos no tiene que volver a
  // pedir (y pisar) los favoritos.
  const userId = sessionUser?.userId;
  const hasSessionWithToken = Boolean(sessionUser?.token);
  const seller = isSeller(sessionUser);

  useEffect(() => {
    // Un vendedor no tiene favoritos (la API le responde 403).
    if (!hasSessionWithToken || seller) return;

    let cancelled = false;
    getFavorites()
      .then((list) => {
        if (!cancelled) setFavorites(list);
      })
      .catch(() => {
        if (!cancelled) setFavorites([]);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, hasSessionWithToken, seller]);

  /* =====================================================
     AVISOS DE STOCK («Avisame cuando haya»)
     Ids de los repuestos agotados de los que el cliente
     pidió aviso. Se cargan igual que los favoritos.
  ====================================================== */

  const [noticesStock, setNoticesStock] = useState([]);

  useEffect(() => {
    // Un vendedor no pide avisos de stock (la API le responde 403).
    if (!hasSessionWithToken || seller) return;

    let cancelled = false;
    getStockAlerts()
      .then((ids) => {
        if (!cancelled) setNoticesStock(ids);
      })
      .catch(() => {
        if (!cancelled) setNoticesStock([]);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, hasSessionWithToken, seller]);


  /* =====================================================
     NAVEGACIÓN
     (antes: setPagina("x") — ahora: navigate("/x"))
  ====================================================== */

  // El Vehículo Activo vive en VehicleContext y NO se toca acá: ir al
  // catálogo (desde el navbar, el carrito, el detalle...) mantiene el
  // auto que el cliente ya había confirmado. Se quita solo con
  // "Borrar filtros" (ver Home y Catalogo).
  // Si llega un vehículo (por ejemplo, la marca elegida en Home o en
   // /marcas), pasa a ser el Vehículo Activo.
  // Con `fabricante` (los botones de fabricantes del inicio) o `marca`
  // (los logos de marcas del inicio y de /marcas), el catálogo abre con
  // ese filtro tildado. Son filtros de una sola vez: a diferencia del
  // vehículo, no se arrastran al volver a entrar al catálogo.
  const goToCatalogo = (categoria = null, vehicle = null, { fabricante, marca } = {}) => {
     setCategoryCatalogo(categoria);

     if (vehicle) {
       activateVehicle(vehicle);
     }

     const params = new URLSearchParams();
     if (fabricante) params.set("fabricante", fabricante);
     if (marca) params.set("marca", marca);
     const query = params.toString();

     navigate(query ? `/catalogo?${query}` : "/catalogo");
  };

  const goToDetail = (product) => {
    const partId = product?.partId ?? product?.id;
    const slug = slugifyProduct(product?.displayName, partId);
    if (!slug) return;
    navigate(`/producto/${encodeURIComponent(slug)}`);
  };

  const goToCart = () => {
    navigate("/carrito");
  };

  const goToFavorites = () => {
    if (!sessionUser) {
      navigate("/login");
      return;
    }

    if (seller) {
      navigate("/dashboard");
      return;
    }

    navigate("/favoritos");
  };

  /* =====================================================
     LOGIN
  ====================================================== */

  const startSession = (
    userLoggedIn,
    remember
  ) => {
    setUser(userLoggedIn);

    // Se borra cualquier sesión anterior (por ejemplo, una vencida de
    // «Recordarme»): obtenerSesion lee primero localStorage, así que si
    // quedara ahí taparía a la nueva y /dashboard mandaría al vendedor de
    // vuelta al login.
    localStorage.removeItem("autobought-sesion");
    sessionStorage.removeItem("autobought-sesion");

    if (remember) {
      localStorage.setItem(
        "autobought-sesion",
        JSON.stringify(userLoggedIn)
      );
    } else {
      sessionStorage.setItem(
        "autobought-sesion",
        JSON.stringify(userLoggedIn)
      );
    }

    // Un vendedor no tiene carrito: va directo a su portal.
    if (isSeller(userLoggedIn)) {
      navigate("/dashboard");
      return;
    }

    loadCart();
    reloadOrders();
    navigate("/");
  };

  /* =====================================================
     REGISTRO
  ====================================================== */

  const registroExitoso = (newUser) => {
    setUser(newUser);

    localStorage.setItem(
      "autobought-sesion",
      JSON.stringify(newUser)
    );

    loadCart();
    navigate("/");
  };

  /* =====================================================
     ACTUALIZAR USUARIO
  ====================================================== */

  const updateUser = (updatedUser) => {
    const currentSession = getSession();

    if (!currentSession || currentSession.token !== updatedUser.token) {
      return;
    }

    setUser(updatedUser);
    saveSession(updatedUser);
  };

  /* =====================================================
     CORREO VERIFICADO
     El enlace del mail se puede abrir con o sin sesión; si
     hay una abierta, se le saca el aviso de verificación.
  ====================================================== */

  const markVerifiedEmail = useCallback(() => {
    const currentSession = getSession();
    if (!currentSession) return;

    const verified = { ...currentSession, verifiedEmail: true };
    saveSession(verified);
    setUser((current) => (current ? { ...current, verifiedEmail: true } : current));
  }, []);

  /* =====================================================
     CERRAR SESIÓN
  ====================================================== */

  const closeSession = () => {
    setUser(null);

    localStorage.removeItem("autobought-sesion");
    sessionStorage.removeItem("autobought-sesion");

    clearCartLocal();
    forgetChatPit();
    setFavorites([]);
    setNoticesStock([]);
    clearOrders();
    navigate("/");
  };

  /* =====================================================
     RENOVACIÓN AUTOMÁTICA DE LA SESIÓN
     Un rato antes de que venza el token se pide uno nuevo y
     se reemplaza en la sesión, sin que el cliente lo note.
  ====================================================== */

  const reemplazarToken = ({ access_token, token_type }) => {
    // Si no hay sesión guardada, el cliente cerró sesión en otra pestaña:
    // no se la resucita, se cierra también acá.
    if (!getSession()) {
      closeSession();
      return;
    }

    const renewed = {
      ...getSession(),
      token: access_token,
      ...(token_type ? { tokenType: token_type } : {}),
    };

    saveSession(renewed);
    setUser((current) => (current ? { ...current, ...renewed } : current));
  };

  // Único lugar que reacciona a una sesión inválida: lo disparan el 401 de
  // cualquier pedido autenticado (ver `alSesionInvalida` en api.js) y la
  // renovación automática. El mensaje sirve para los dos casos: token
  // vencido o contraseña cambiada en otro dispositivo.
  const expiredSession = () => {
    closeSession();
    toast.error("Tu sesión se cerró. Iniciá sesión de nuevo.");
    navigate("/login");
  };

  // El manejador se registra una sola vez y lee la versión más reciente de
  // `sesionVencida` desde una ref.
  const sessionExpiredRef = useRef(expiredSession);
  useEffect(() => {
    sessionExpiredRef.current = expiredSession;
  });

  // Si varios pedidos dan 401 a la vez, el primero cierra la sesión y los
  // demás la encuentran ya cerrada: un solo toast y una sola navegación.
  useEffect(
    () =>
      onInvalidSession(() => {
        if (!getSession()) return;
        sessionExpiredRef.current();
      }),
    []
  );

  // Otras pantallas pueden guardar la sesión sin pasar por App (ej:
  // CambiarPassword guarda el token nuevo): `usuario` la sigue para que la
  // renovación automática no intente renovar el token viejo.
  useEffect(
    () =>
      onSessionSaved(() => {
        const saved = getSession();
        if (!saved) return;
        setUser((current) => (current ? { ...current, ...saved } : current));
      }),
    []
  );

  useSessionRenewal(sessionUser?.token, {
    onRenewed: reemplazarToken,
    onExpired: expiredSession,
  });

  /* =====================================================
     FAVORITOS
  ====================================================== */

  const toggleFavorite = async (product) => {
    if (!sessionUser) {
      navigate("/login");
      return;
    }

    if (seller) {
      toast.error("Los vendedores no tienen favoritos.");
      return;
    }

    const existe = favorites.some(
      (item) => item.id === product.id
    );

    setFavorites((current) =>
      existe
        ? current.filter((item) => item.id !== product.id)
        : [...current, product]
    );

    try {
      if (existe) {
        await removeFavoriteApi(product.partId ?? product.id);
      } else {
        await addFavoriteApi(product.partId ?? product.id);
      }
    } catch (error) {
      setFavorites((current) =>
        existe
          ? [...current, product]
          : current.filter((item) => item.id !== product.id)
      );

      // Un 401 lo maneja `alSesionInvalida` (toast y /login): acá solo se
      // deshace el cambio optimista, sin un segundo aviso.
      if (error.status === 401) return;

      toast.error(error.message || "No pudimos actualizar tus favoritos.");
    }
  };

  const toggleNoticeStock = async (product) => {
    if (!sessionUser) {
      navigate("/login");
      return;
    }

    if (seller) {
      toast.error("Los vendedores no piden avisos de stock.");
      return;
    }

    const partId = product.partId;
    const tenia = noticesStock.includes(partId);

    setNoticesStock((current) =>
      tenia ? current.filter((id) => id !== partId) : [...current, partId]
    );

    try {
      if (tenia) {
        await removeStockAlert(partId);
      } else {
        await addStockAlert(partId);
        toast.success("Listo: te mandamos un mail cuando vuelva a haber stock.");
      }
    } catch (error) {
      setNoticesStock((current) =>
        tenia ? [...current, partId] : current.filter((id) => id !== partId)
      );

      // Igual que en favoritos: el 401 lo maneja `alSesionInvalida`.
      if (error.status === 401) return;

      toast.error(error.message || "No pudimos actualizar el aviso.");
    }
  };

  const hasNoticeStock = (partId) => noticesStock.includes(partId);

  const isFavorite = (id) =>
    favorites.some(
      (item) => item.id === id
    );

  /* =====================================================
     PROPS NAVBAR
  ====================================================== */

  const propsNavbar = {
    sessionUser,

    onHome: () => navigate("/"),

    onCatalogo: goToCatalogo,

    onLogin: () => {
      if (sessionUser) {
        navigate("/perfil");
      } else {
        navigate("/login");
      }
    },

    onBrands: () => navigate("/marcas"),

    onCart: goToCart,

    onFavorites: goToFavorites,

    // ==========================================
    // ACCESOS DEL MENÚ DE USUARIO
    // ==========================================

    onProfile: () => navigate("/perfil"),

    // «Mi cuenta» (/cuenta): el menú de la cuenta (en celular, su página).
    onAccount: () => navigate("/cuenta"),

    onAddresses: () => navigate("/direcciones"),

    onHistory: () => navigate("/historial"),

    // «Mis compras»: las que están en curso (el ícono de la barra).
    onOrders: () => navigate("/pedidos"),

    onCloseSession: closeSession,

    // ==========================================
    // CONTADORES
    // (cantidadCarrito ya no se pasa por prop: Navbar la
    // lee directo de CartContext con useCart())
    // ==========================================

    favoritesQuantity: favorites.length,
  };

  /* =====================================================
     RENDER
  ====================================================== */

  // El footer queda siempre al fondo: si la página tiene poco contenido
  // (un carrito vacío), el espacio que sobra queda arriba del footer y no
  // debajo. Cada página trae su propio `min-h-screen`; acá se reemplaza
  // por "ocupar lo que sobre" (flex-1) para que la página y el footer
  // juntos llenen la pantalla.
  // El portal del vendedor (/dashboard y el detalle de un repuesto) tiene
  // su propio marco, sin el footer de la tienda.
  const withFooter = !ROUTES_WITHOUT_FOOTER.includes(pathname) && !pathname.startsWith("/dashboard");

  // Pit (el asistente con IA) flota en las páginas de la tienda para los
  // clientes con sesión: no en las pantallas de cuenta sin footer (login,
  // registro...) ni para el vendedor. No tiene página propia: se abre al
  // costado, sin salir de lo que el cliente estaba mirando.
  const showPit = Boolean(sessionUser) && !seller && withFooter;

  return (
    <>
    <VerifyEmailNotice sessionUser={sessionUser} onVerified={markVerifiedEmail} />
    <div className={withFooter ? "min-h-screen flex flex-col" : undefined}>
    <div className={withFooter ? "flex-1 flex flex-col *:flex-1 *:min-h-0!" : undefined}>
    <Routes>
      {/* =================================================
          HOME
      ================================================== */}

      <Route
        path="/"
        element={
          <Home {...propsNavbar} onDetail={goToDetail} />
        }
      />

      {/* =================================================
          MARCAS
      ================================================== */}

      <Route
        path="/marcas"
        element={<Brands {...propsNavbar} />}
      />

      {/* =================================================
          LOGIN
      ================================================== */}

      <Route
        path="/login"
        element={
          <Login
            {...propsNavbar}
            onStartSession={startSession}
            onRegistro={() => navigate("/registro")}
            onOlvidePassword={() => navigate("/recuperar-password")}
          />
        }
      />

      {/* =================================================
          CUENTA: RECUPERAR CONTRASEÑA Y VERIFICAR CORREO
          Se abren desde los enlaces de los mails, sin sesión.
      ================================================== */}

      <Route
        path="/recuperar-password"
        element={
          <ForgotPassword
            {...propsNavbar}
            onGoBackLogin={() => navigate("/login")}
          />
        }
      />

      <Route
        path="/restablecer-password"
        element={
          <ResetPassword
            {...propsNavbar}
            onStartSession={() => navigate("/login")}
            onAskOtherLink={() => navigate("/recuperar-password")}
          />
        }
      />

      <Route
        path="/baja-mails"
        element={
          <Unsubscribe
            {...propsNavbar}
            onGoToStore={() => navigate("/")}
          />
        }
      />

      <Route
        path="/verificar-correo"
        element={
          <VerifyEmail
            {...propsNavbar}
            onVerified={markVerifiedEmail}
            onGoToStore={() => navigate("/")}
          />
        }
      />

      {/* =================================================
          REGISTRO
      ================================================== */}

      <Route
        path="/registro"
        element={
          <Register
            {...propsNavbar}
            onRegistroExitoso={registroExitoso}
          />
        }
      />

      {/* =================================================
          CATÁLOGO Y DETALLE DE PRODUCTO
          Navegar el catálogo es público: no requiere sesión.
          Agregar al carrito o marcar favoritos sí la requiere
          (ver el guard de addToCart en CartContext, que muestra
          un aviso con botón "Iniciar sesión", y el de
          alternarFavorito, que redirige a /login).
      ================================================== */}

      <Route
        path="/catalogo"
        element={
          <Catalog
            {...propsNavbar}
            onDetail={goToDetail}
            initialCategory={categoryCatalogo}
            onSelectedCategory={setCategoryCatalogo}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            isFavorite={isFavorite}
            onToggleNoticeStock={toggleNoticeStock}
            hasNoticeStock={hasNoticeStock}
          />
        }
      />

      <Route
        path="/producto/:id"
        element={
          <ProductDetail
            {...propsNavbar}
            onDetail={goToDetail}
            onCatalogo={goToCatalogo}
            onToggleFavorite={toggleFavorite}
            isFavorite={isFavorite}
            onToggleNoticeStock={toggleNoticeStock}
            hasNoticeStock={hasNoticeStock}
          />
        }
      />

      {/* =================================================
          RUTAS PROTEGIDAS
          (requieren sesión activa)
      ================================================== */}

      <Route element={<ProtectedRoute />}>
        <Route
          path="/carrito"
          element={
            <CartPage
              {...propsNavbar}
              onDetail={goToDetail}
              onAddresses={() => navigate("/direcciones")}
            />
          }
        />

        {/* FAVORITOS */}

        <Route
          path="/favoritos"
          element={
            <Favorites
              {...propsNavbar}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onDetail={goToDetail}
            />
          }
        />

        {/* PERFIL
            ProtectedRoute mira la sesión guardada y `usuario` es el
            estado de App: si alguna vez no coinciden (ej. sesión
            iniciada en otra pestaña), se manda al login en vez de
            renderizar Perfil sin usuario. */}

        <Route
          path="/perfil"
          element={
            sessionUser ? (
              <Profile
                {...propsNavbar}
                sessionUser={sessionUser}
                onUpdateUser={updateUser}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* MI CUENTA: el menú (en celular, su propia página), la
            contraseña y los mails. */}

        <Route path="/cuenta" element={<AccountHome {...propsNavbar} />} />

        <Route
          path="/seguridad"
          element={sessionUser ? <Security {...propsNavbar} /> : <Navigate to="/login" replace />}
        />

        <Route
          path="/notificaciones"
          element={
            sessionUser ? (
              <Notifications {...propsNavbar} onUpdateUser={updateUser} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* DIRECCIONES */}

        <Route
          path="/direcciones"
          element={
            <Addresses
              {...propsNavbar}
            />
          }
        />

        {/* VUELTA DE MERCADO PAGO
            Mercado Pago devuelve al cliente acá después de pagar (o de
            fallar el pago), con el número de pedido en la dirección. */}

        <Route
          path="/pago"
          element={
            <PaymentResult {...propsNavbar} />
          }
        />

        {/* MIS COMPRAS: las que están en curso (el ícono de la barra) y
            el detalle de cada una; las anteriores, en /historial. */}

        <Route path="/pedidos" element={<MyOrders {...propsNavbar} />} />
        <Route path="/pedidos/:id" element={<MyOrders {...propsNavbar} />} />

        {/* MIS COMPRAS › ANTERIORES (las que ya terminaron) */}

        <Route
          path="/historial"
          element={
            <PurchaseHistory
              {...propsNavbar}
            />
          }
        />
      </Route>

      {/* =================================================
          DASHBOARD DEL VENDEDOR
          (solo sesiones de vendedor)
      ================================================== */}

      <Route element={<EmployeeRoute />}>
        <Route
          path="/dashboard"
          element={
            <Suspense fallback={dashboardLoading}>
              <Dashboard {...propsNavbar} sessionUser={sessionUser} />
            </Suspense>
          }
        />
        <Route
          path="/dashboard/repuestos/:id"
          element={
            <Suspense fallback={dashboardLoading}>
              <SellerPartDetail {...propsNavbar} sessionUser={sessionUser} />
            </Suspense>
          }
        />
        <Route
          path="/dashboard/pedidos/:id"
          element={
            <Suspense fallback={dashboardLoading}>
              <SellerOrderDetail {...propsNavbar} sessionUser={sessionUser} />
            </Suspense>
          }
        />
      </Route>

      {/* =================================================
          PÁGINA NO ENCONTRADA
          Cualquier dirección que no coincide con las de arriba.
      ================================================== */}

      <Route
        path="*"
        element={<NotFoundPage {...propsNavbar} />}
      />
    </Routes>
    </div>
    {/* Las pantallas de iniciar sesión y registro tienen su propio armado. */}
    {withFooter && <Footer {...propsNavbar} />}
    </div>
    {showPit && (
      <PitPanel
        onDetail={goToDetail}
        onSearchInCatalogo={(queryState) => navigate(`/catalogo?q=${encodeURIComponent(queryState)}`)}
      />
    )}
    </>
  );
}

export default App;
