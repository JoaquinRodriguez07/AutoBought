import { useCallback, useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { alGuardarSesion, esVendedor, guardarSesion, obtenerSesion, sesionValida } from "./auth";
import { useRenovacionSesion } from "./useRenovacionSesion";
import {
  alSesionInvalida,
  agregarAvisoStock,
  agregarFavoritoAPI,
  obtenerAvisosStock,
  obtenerFavoritos,
  quitarAvisoStock,
  quitarFavoritoAPI,
} from "./api";
import { useCart } from "./context/CartContext";
import { useVehicle } from "./context/VehicleContext";
import { slugificarProducto } from "./slugProducto";

import Home from "./Home";
import Login from "./Login";
import Registro from "./Registro";
import Perfil from "./Perfil";
import Direcciones from "./Direcciones";
import MetodosPago from "./MetodosPago";
import HistorialCompras from "./HistorialCompras";
import Catalogo from "./Catalogo";
import DetalleProducto from "./DetalleProducto";
import Marcas from "./Marcas";
import Carrito from "./Carrito";
import Favoritos from "./Favoritos";
import PanelPit from "./PanelPit";
import { usePit } from "./context/PitContext";
import ProtectedRoute from "./ProtectedRoute";
import Footer from "./Footer";
import EmployeeRoute from "./EmployeeRoute";
import PortalVendedor from "./dashboard/PortalVendedor";
import PaginaNoEncontrada from "./PaginaNoEncontrada";
import RecuperarPassword from "./RecuperarPassword";
import RestablecerPassword from "./RestablecerPassword";
import VerificarCorreo from "./VerificarCorreo";
import AvisoVerificarCorreo from "./AvisoVerificarCorreo";
import DarseDeBaja from "./DarseDeBaja";

const RUTAS_SIN_FOOTER = [
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
  const { cargarCarrito, limpiarCarritoLocal } = useCart();
  const { activarVehiculo } = useVehicle();
  const { olvidar: olvidarCharlaPit } = usePit();


  // null = sin filtro de categoría (el catálogo muestra todos los
  // repuestos). Los nombres de categoría los define el backend
  // (GET /api/v1/parts/categories), no el frontend.
  const [categoriaCatalogo, setCategoriaCatalogo] =
    useState(null);

  /* =====================================================
     SESIÓN
  ====================================================== */

  const [usuario, setUsuario] = useState(() => {
    const sesion = obtenerSesion();
    return sesionValida(sesion) ? sesion : null;
  });

  /* =====================================================
     FAVORITOS
  ====================================================== */

  const [favoritos, setFavoritos] = useState([]);

  // El efecto depende de quién es el usuario y de si hay token, NO del
  // valor del token: renovarlo cada ~55 minutos no tiene que volver a
  // pedir (y pisar) los favoritos.
  const userId = usuario?.userId;
  const haySesionConToken = Boolean(usuario?.token);
  const vendedor = esVendedor(usuario);

  useEffect(() => {
    // Un vendedor no tiene favoritos (la API le responde 403).
    if (!haySesionConToken || vendedor) return;

    let cancelado = false;
    obtenerFavoritos()
      .then((lista) => {
        if (!cancelado) setFavoritos(lista);
      })
      .catch(() => {
        if (!cancelado) setFavoritos([]);
      });

    return () => {
      cancelado = true;
    };
  }, [userId, haySesionConToken, vendedor]);

  /* =====================================================
     AVISOS DE STOCK («Avisame cuando haya»)
     Ids de los repuestos agotados de los que el cliente
     pidió aviso. Se cargan igual que los favoritos.
  ====================================================== */

  const [avisosStock, setAvisosStock] = useState([]);

  useEffect(() => {
    // Un vendedor no pide avisos de stock (la API le responde 403).
    if (!haySesionConToken || vendedor) return;

    let cancelado = false;
    obtenerAvisosStock()
      .then((ids) => {
        if (!cancelado) setAvisosStock(ids);
      })
      .catch(() => {
        if (!cancelado) setAvisosStock([]);
      });

    return () => {
      cancelado = true;
    };
  }, [userId, haySesionConToken, vendedor]);

  /* =====================================================
     DIRECCIONES
  ====================================================== */

  const [direcciones, setDirecciones] = useState(() => {
    try {
      return (
        JSON.parse(
          localStorage.getItem(
            "autobought-direcciones"
          )
        ) || []
      );
    } catch {
      return [];
    }
  });

  /* =====================================================
     MÉTODOS DE PAGO
  ====================================================== */

  const [metodosPago, setMetodosPago] = useState(() => {
    try {
      return (
        JSON.parse(
          localStorage.getItem(
            "autobought-metodos-pago"
          )
        ) || []
      );
    } catch {
      return [];
    }
  });

  /* =====================================================
     HISTORIAL DE COMPRAS
  ====================================================== */

  const [historialCompras, setHistorialCompras] =
    useState(() => {
      try {
        return (
          JSON.parse(
            localStorage.getItem(
              "autobought-historial-compras"
            )
          ) || []
        );
      } catch {
        return [];
      }
    });

  /* =====================================================
     GUARDAR DIRECCIONES
  ====================================================== */

  useEffect(() => {
    localStorage.setItem(
      "autobought-direcciones",
      JSON.stringify(direcciones)
    );
  }, [direcciones]);

  /* =====================================================
     GUARDAR MÉTODOS DE PAGO
  ====================================================== */

  useEffect(() => {
    localStorage.setItem(
      "autobought-metodos-pago",
      JSON.stringify(metodosPago)
    );
  }, [metodosPago]);

  /* =====================================================
     GUARDAR HISTORIAL
  ====================================================== */

  useEffect(() => {
    localStorage.setItem(
      "autobought-historial-compras",
      JSON.stringify(historialCompras)
    );
  }, [historialCompras]);

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
  const irAlCatalogo = (categoria = null, vehiculo = null, { fabricante, marca } = {}) => {
     setCategoriaCatalogo(categoria);

     if (vehiculo) {
       activarVehiculo(vehiculo);
     }

     const params = new URLSearchParams();
     if (fabricante) params.set("fabricante", fabricante);
     if (marca) params.set("marca", marca);
     const query = params.toString();

     navigate(query ? `/catalogo?${query}` : "/catalogo");
  };

  const irAlDetalle = (producto) => {
    const partId = producto?.partId ?? producto?.id;
    const slug = slugificarProducto(producto?.nombre, partId);
    if (!slug) return;
    navigate(`/producto/${encodeURIComponent(slug)}`);
  };

  const irAlCarrito = () => {
    navigate("/carrito");
  };

  const irAFavoritos = () => {
    if (!usuario) {
      navigate("/login");
      return;
    }

    if (vendedor) {
      navigate("/dashboard");
      return;
    }

    navigate("/favoritos");
  };

  /* =====================================================
     LOGIN
  ====================================================== */

  const iniciarSesion = (
    usuarioLogueado,
    recordar
  ) => {
    setUsuario(usuarioLogueado);

    if (recordar) {
      localStorage.setItem(
        "autobought-sesion",
        JSON.stringify(usuarioLogueado)
      );
    } else {
      sessionStorage.setItem(
        "autobought-sesion",
        JSON.stringify(usuarioLogueado)
      );
    }

    // Un vendedor no tiene carrito: va directo a su portal.
    if (esVendedor(usuarioLogueado)) {
      navigate("/dashboard");
      return;
    }

    cargarCarrito();
    navigate("/");
  };

  /* =====================================================
     REGISTRO
  ====================================================== */

  const registroExitoso = (usuarioNuevo) => {
    setUsuario(usuarioNuevo);

    localStorage.setItem(
      "autobought-sesion",
      JSON.stringify(usuarioNuevo)
    );

    cargarCarrito();
    navigate("/");
  };

  /* =====================================================
     ACTUALIZAR USUARIO
  ====================================================== */

  const actualizarUsuario = (usuarioActualizado) => {
    const sesionActual = obtenerSesion();

    if (!sesionActual || sesionActual.token !== usuarioActualizado.token) {
      return;
    }

    setUsuario(usuarioActualizado);
    guardarSesion(usuarioActualizado);
  };

  /* =====================================================
     CORREO VERIFICADO
     El enlace del mail se puede abrir con o sin sesión; si
     hay una abierta, se le saca el aviso de verificación.
  ====================================================== */

  const marcarCorreoVerificado = useCallback(() => {
    const sesionActual = obtenerSesion();
    if (!sesionActual) return;

    const verificada = { ...sesionActual, emailVerificado: true };
    guardarSesion(verificada);
    setUsuario((actual) => (actual ? { ...actual, emailVerificado: true } : actual));
  }, []);

  /* =====================================================
     CERRAR SESIÓN
  ====================================================== */

  const cerrarSesion = () => {
    setUsuario(null);

    localStorage.removeItem("autobought-sesion");
    sessionStorage.removeItem("autobought-sesion");

    limpiarCarritoLocal();
    olvidarCharlaPit();
    setFavoritos([]);
    setAvisosStock([]);
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
    if (!obtenerSesion()) {
      cerrarSesion();
      return;
    }

    const renovada = {
      ...obtenerSesion(),
      token: access_token,
      ...(token_type ? { tokenType: token_type } : {}),
    };

    guardarSesion(renovada);
    setUsuario((actual) => (actual ? { ...actual, ...renovada } : actual));
  };

  // Único lugar que reacciona a una sesión inválida: lo disparan el 401 de
  // cualquier pedido autenticado (ver `alSesionInvalida` en api.js) y la
  // renovación automática. El mensaje sirve para los dos casos: token
  // vencido o contraseña cambiada en otro dispositivo.
  const sesionVencida = () => {
    cerrarSesion();
    toast.error("Tu sesión se cerró. Iniciá sesión de nuevo.");
    navigate("/login");
  };

  // El manejador se registra una sola vez y lee la versión más reciente de
  // `sesionVencida` desde una ref.
  const sesionVencidaRef = useRef(sesionVencida);
  useEffect(() => {
    sesionVencidaRef.current = sesionVencida;
  });

  // Si varios pedidos dan 401 a la vez, el primero cierra la sesión y los
  // demás la encuentran ya cerrada: un solo toast y una sola navegación.
  useEffect(
    () =>
      alSesionInvalida(() => {
        if (!obtenerSesion()) return;
        sesionVencidaRef.current();
      }),
    []
  );

  // Otras pantallas pueden guardar la sesión sin pasar por App (ej:
  // CambiarPassword guarda el token nuevo): `usuario` la sigue para que la
  // renovación automática no intente renovar el token viejo.
  useEffect(
    () =>
      alGuardarSesion(() => {
        const guardada = obtenerSesion();
        if (!guardada) return;
        setUsuario((actual) => (actual ? { ...actual, ...guardada } : actual));
      }),
    []
  );

  useRenovacionSesion(usuario?.token, {
    onRenovada: reemplazarToken,
    onVencida: sesionVencida,
  });

  /* =====================================================
     FAVORITOS
  ====================================================== */

  const alternarFavorito = async (producto) => {
    if (!usuario) {
      navigate("/login");
      return;
    }

    if (vendedor) {
      toast.error("Los vendedores no tienen favoritos.");
      return;
    }

    const existe = favoritos.some(
      (item) => item.id === producto.id
    );

    setFavoritos((actual) =>
      existe
        ? actual.filter((item) => item.id !== producto.id)
        : [...actual, producto]
    );

    try {
      if (existe) {
        await quitarFavoritoAPI(producto.partId ?? producto.id);
      } else {
        await agregarFavoritoAPI(producto.partId ?? producto.id);
      }
    } catch (error) {
      setFavoritos((actual) =>
        existe
          ? [...actual, producto]
          : actual.filter((item) => item.id !== producto.id)
      );

      // Un 401 lo maneja `alSesionInvalida` (toast y /login): acá solo se
      // deshace el cambio optimista, sin un segundo aviso.
      if (error.status === 401) return;

      toast.error(error.message || "No pudimos actualizar tus favoritos.");
    }
  };

  const alternarAvisoStock = async (producto) => {
    if (!usuario) {
      navigate("/login");
      return;
    }

    if (vendedor) {
      toast.error("Los vendedores no piden avisos de stock.");
      return;
    }

    const partId = producto.partId;
    const tenia = avisosStock.includes(partId);

    setAvisosStock((actual) =>
      tenia ? actual.filter((id) => id !== partId) : [...actual, partId]
    );

    try {
      if (tenia) {
        await quitarAvisoStock(partId);
      } else {
        await agregarAvisoStock(partId);
        toast.success("Listo: te mandamos un mail cuando vuelva a haber stock.");
      }
    } catch (error) {
      setAvisosStock((actual) =>
        tenia ? [...actual, partId] : actual.filter((id) => id !== partId)
      );

      // Igual que en favoritos: el 401 lo maneja `alSesionInvalida`.
      if (error.status === 401) return;

      toast.error(error.message || "No pudimos actualizar el aviso.");
    }
  };

  const tieneAvisoStock = (partId) => avisosStock.includes(partId);

  const esFavorito = (id) =>
    favoritos.some(
      (item) => item.id === id
    );

  /* =====================================================
     PROPS NAVBAR
  ====================================================== */

  const propsNavbar = {
    usuario,

    onHome: () => navigate("/"),

    onCatalogo: irAlCatalogo,

    onLogin: () => {
      if (usuario) {
        navigate("/perfil");
      } else {
        navigate("/login");
      }
    },

    onMarcas: () => navigate("/marcas"),

    onCarrito: irAlCarrito,

    onFavoritos: irAFavoritos,

    // ==========================================
    // ACCESOS DEL MENÚ DE USUARIO
    // ==========================================

    onPerfil: () => navigate("/perfil"),

    onDirecciones: () => navigate("/direcciones"),

    onMetodosPago: () => navigate("/metodos-pago"),

    onHistorial: () => navigate("/historial"),

    onCerrarSesion: cerrarSesion,

    // ==========================================
    // CONTADORES
    // (cantidadCarrito ya no se pasa por prop: Navbar la
    // lee directo de CartContext con useCart())
    // ==========================================

    cantidadFavoritos: favoritos.length,
  };

  /* =====================================================
     RENDER
  ====================================================== */

  // El footer queda siempre al fondo: si la página tiene poco contenido
  // (un carrito vacío), el espacio que sobra queda arriba del footer y no
  // debajo. Cada página trae su propio `min-h-screen`; acá se reemplaza
  // por "ocupar lo que sobre" (flex-1) para que la página y el footer
  // juntos llenen la pantalla.
  const conFooter = !RUTAS_SIN_FOOTER.includes(pathname);

  // Pit (el asistente con IA) flota en las páginas de la tienda para los
  // clientes con sesión: no en las pantallas de cuenta sin footer (login,
  // registro...) ni para el vendedor. No tiene página propia: se abre al
  // costado, sin salir de lo que el cliente estaba mirando.
  const mostrarPit = Boolean(usuario) && !vendedor && conFooter;

  return (
    <>
    <AvisoVerificarCorreo usuario={usuario} />
    <div className={conFooter ? "min-h-screen flex flex-col" : undefined}>
    <div className={conFooter ? "flex-1 flex flex-col *:flex-1 *:min-h-0!" : undefined}>
    <Routes>
      {/* =================================================
          HOME
      ================================================== */}

      <Route
        path="/"
        element={
          <Home {...propsNavbar} onDetalle={irAlDetalle} />
        }
      />

      {/* =================================================
          MARCAS
      ================================================== */}

      <Route
        path="/marcas"
        element={<Marcas {...propsNavbar} />}
      />

      {/* =================================================
          LOGIN
      ================================================== */}

      <Route
        path="/login"
        element={
          <Login
            {...propsNavbar}
            onIniciarSesion={iniciarSesion}
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
          <RecuperarPassword
            {...propsNavbar}
            onVolverAlLogin={() => navigate("/login")}
          />
        }
      />

      <Route
        path="/restablecer-password"
        element={
          <RestablecerPassword
            {...propsNavbar}
            onIniciarSesion={() => navigate("/login")}
            onPedirOtroEnlace={() => navigate("/recuperar-password")}
          />
        }
      />

      <Route
        path="/baja-mails"
        element={
          <DarseDeBaja
            {...propsNavbar}
            onIrALaTienda={() => navigate("/")}
          />
        }
      />

      <Route
        path="/verificar-correo"
        element={
          <VerificarCorreo
            {...propsNavbar}
            onVerificado={marcarCorreoVerificado}
            onIrALaTienda={() => navigate("/")}
          />
        }
      />

      {/* =================================================
          REGISTRO
      ================================================== */}

      <Route
        path="/registro"
        element={
          <Registro
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
          <Catalogo
            {...propsNavbar}
            onDetalle={irAlDetalle}
            categoriaInicial={categoriaCatalogo}
            onCategoriaSeleccionada={setCategoriaCatalogo}
            favoritos={favoritos}
            onAlternarFavorito={alternarFavorito}
            esFavorito={esFavorito}
            onAlternarAvisoStock={alternarAvisoStock}
            tieneAvisoStock={tieneAvisoStock}
          />
        }
      />

      <Route
        path="/producto/:id"
        element={
          <DetalleProducto
            {...propsNavbar}
            onDetalle={irAlDetalle}
            onCatalogo={irAlCatalogo}
            onAlternarFavorito={alternarFavorito}
            esFavorito={esFavorito}
            onAlternarAvisoStock={alternarAvisoStock}
            tieneAvisoStock={tieneAvisoStock}
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
            <Carrito
              {...propsNavbar}
              onDetalle={irAlDetalle}
              onDirecciones={() => navigate("/direcciones")}
              onMetodosPago={() => navigate("/metodos-pago")}
            />
          }
        />

        {/* FAVORITOS */}

        <Route
          path="/favoritos"
          element={
            <Favoritos
              {...propsNavbar}
              favoritos={favoritos}
              onAlternarFavorito={alternarFavorito}
              onDetalle={irAlDetalle}
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
            usuario ? (
              <Perfil
                {...propsNavbar}
                usuario={usuario}
                onActualizarUsuario={actualizarUsuario}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* DIRECCIONES */}

        <Route
          path="/direcciones"
          element={
            <Direcciones
              {...propsNavbar}
              direcciones={direcciones}
              setDirecciones={setDirecciones}
            />
          }
        />

        {/* MÉTODOS DE PAGO */}

        <Route
          path="/metodos-pago"
          element={
            <MetodosPago
              {...propsNavbar}
              metodosPago={metodosPago}
              setMetodosPago={setMetodosPago}
            />
          }
        />

        {/* HISTORIAL DE COMPRAS */}

        <Route
          path="/historial"
          element={
            <HistorialCompras
              {...propsNavbar}
              historialCompras={historialCompras}
            />
          }
        />
      </Route>

      {/* =================================================
          PORTAL DEL VENDEDOR
          (solo sesiones de vendedor)
      ================================================== */}

      <Route element={<EmployeeRoute />}>
        <Route
          path="/dashboard"
          element={
            <PortalVendedor
              {...propsNavbar}
              usuario={usuario}
            />
          }
        />
      </Route>

      {/* =================================================
          PÁGINA NO ENCONTRADA
          Cualquier dirección que no coincide con las de arriba.
      ================================================== */}

      <Route
        path="*"
        element={<PaginaNoEncontrada {...propsNavbar} />}
      />
    </Routes>
    </div>
    {/* Las pantallas de iniciar sesión y registro tienen su propio armado. */}
    {conFooter && <Footer {...propsNavbar} />}
    </div>
    {mostrarPit && (
      <PanelPit
        onDetalle={irAlDetalle}
        onBuscarEnCatalogo={(consulta) => navigate(`/catalogo?q=${encodeURIComponent(consulta)}`)}
        onVerCarrito={irAlCarrito}
      />
    )}
    </>
  );
}

export default App;
