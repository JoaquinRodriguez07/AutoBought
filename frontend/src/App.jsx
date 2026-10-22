import { useCallback, useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { guardarSesion, obtenerSesion, sesionValida } from "./auth";
import { useRenovacionSesion } from "./useRenovacionSesion";
import {
  agregarAvisoStock,
  agregarFavoritoAPI,
  obtenerAvisosStock,
  obtenerFavoritos,
  quitarAvisoStock,
  quitarFavoritoAPI,
} from "./api";
import { useCart } from "./context/CartContext";
import { useVehicle } from "./context/VehicleContext";

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
import ProtectedRoute from "./ProtectedRoute";
import RecuperarPassword from "./RecuperarPassword";
import RestablecerPassword from "./RestablecerPassword";
import VerificarCorreo from "./VerificarCorreo";
import AvisoVerificarCorreo from "./AvisoVerificarCorreo";
import DarseDeBaja from "./DarseDeBaja";

function App() {
  const navigate = useNavigate();
  const { cargarCarrito, limpiarCarritoLocal } = useCart();
  const { activarVehiculo } = useVehicle();


  // null = sin filtro de categoría (el catálogo muestra todos los
  // repuestos). Los nombres de categoría los define el backend
  // (GET /api/v1/parts/categories), no el frontend.
  const [categoriaCatalogo, setCategoriaCatalogo] =
    useState(null);

  const [productoSeleccionado, setProductoSeleccionado] =
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

  useEffect(() => {
    if (!haySesionConToken) return;

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
  }, [userId, haySesionConToken]);

  /* =====================================================
     AVISOS DE STOCK («Avisame cuando haya»)
     Ids de los repuestos agotados de los que el cliente
     pidió aviso. Se cargan igual que los favoritos.
  ====================================================== */

  const [avisosStock, setAvisosStock] = useState([]);

  useEffect(() => {
    if (!haySesionConToken) return;

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
  }, [userId, haySesionConToken]);

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
  const irAlCatalogo = (categoria = null, vehiculo = null) => {
     setCategoriaCatalogo(categoria);

     if (vehiculo) {
       activarVehiculo(vehiculo);
     }

     navigate("/catalogo");
  };

  const irAlDetalle = (producto) => {
    setProductoSeleccionado(producto);
    navigate("/producto");
  };

  const irAlCarrito = () => {
    navigate("/carrito");
  };

  const irAFavoritos = () => {
    if (!usuario) {
      navigate("/login");
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

  const sesionVencida = () => {
    cerrarSesion();
    toast.error("Tu sesión venció. Iniciá sesión de nuevo.");
    navigate("/login");
  };

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

      if (error.status === 401) {
        toast.error("Tu sesión venció. Iniciá sesión de nuevo.");
        navigate("/login");
        return;
      }

      toast.error(error.message || "No pudimos actualizar tus favoritos.");
    }
  };

  const alternarAvisoStock = async (producto) => {
    if (!usuario) {
      navigate("/login");
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

      if (error.status === 401) {
        toast.error("Tu sesión venció. Iniciá sesión de nuevo.");
        navigate("/login");
        return;
      }

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

  return (
    <>
    <AvisoVerificarCorreo usuario={usuario} />
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
          (ver el guard de addToCart en CartContext y el de
          alternarFavorito, que redirigen a /login).
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
        path="/producto"
        element={
          <DetalleProducto
            {...propsNavbar}
            onDetalle={irAlDetalle}
            onCatalogo={irAlCatalogo}
            producto={productoSeleccionado}
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
      </Route>

      {/* =================================================
          FAVORITOS
          (mismo comportamiento de antes: pantalla en
          blanco si no hay sesión — no forma parte del
          DoD de esta tarea)
      ================================================== */}

      <Route
        path="/favoritos"
        element={
          usuario ? (
            <Favoritos
              {...propsNavbar}
              favoritos={favoritos}
              onAlternarFavorito={alternarFavorito}
              onDetalle={irAlDetalle}
            />
          ) : null
        }
      />

      {/* =================================================
          PERFIL
      ================================================== */}

      <Route
        path="/perfil"
        element={
          usuario ? (
            <Perfil
              {...propsNavbar}
              usuario={usuario}
              onCerrarSesion={cerrarSesion}
              onActualizarUsuario={actualizarUsuario}
              onDirecciones={() => navigate("/direcciones")}
              onMetodosPago={() => navigate("/metodos-pago")}
              onHistorialCompras={() => navigate("/historial")}
            />
          ) : null
        }
      />

      {/* =================================================
          DIRECCIONES
      ================================================== */}

      <Route
        path="/direcciones"
        element={
          usuario ? (
            <Direcciones
              {...propsNavbar}
              direcciones={direcciones}
              setDirecciones={setDirecciones}
              onPerfil={() => navigate("/perfil")}
            />
          ) : null
        }
      />

      {/* =================================================
          MÉTODOS DE PAGO
      ================================================== */}

      <Route
        path="/metodos-pago"
        element={
          usuario ? (
            <MetodosPago
              {...propsNavbar}
              metodosPago={metodosPago}
              setMetodosPago={setMetodosPago}
              onPerfil={() => navigate("/perfil")}
            />
          ) : null
        }
      />

      {/* =================================================
          HISTORIAL DE COMPRAS
      ================================================== */}

      <Route
        path="/historial"
        element={
          usuario ? (
            <HistorialCompras
              {...propsNavbar}
              historialCompras={historialCompras}
              onPerfil={() => navigate("/perfil")}
            />
          ) : null
        }
      />
    </Routes>
    </>
  );
}

export default App;
