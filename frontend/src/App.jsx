import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { obtenerSesion, sesionValida } from "./auth";
import {
  agregarFavoritoAPI,
  obtenerFavoritos,
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

  useEffect(() => {
    if (!usuario?.token) return;

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
  }, [usuario?.token]);

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

    const storage = localStorage.getItem("autobought-sesion")
      ? localStorage
      : sessionStorage;

    storage.setItem(
      "autobought-sesion",
      JSON.stringify(usuarioActualizado)
    );
  };

  /* =====================================================
     CERRAR SESIÓN
  ====================================================== */

  const cerrarSesion = () => {
    setUsuario(null);

    localStorage.removeItem("autobought-sesion");
    sessionStorage.removeItem("autobought-sesion");

    limpiarCarritoLocal();
    setFavoritos([]);
    navigate("/");
  };

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
    <Routes>
      {/* =================================================
          HOME
      ================================================== */}

      <Route
        path="/"
        element={
          <Home {...propsNavbar} />
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
  );
}

export default App;
