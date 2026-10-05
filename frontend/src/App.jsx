import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { obtenerSesion, sesionValida } from "./auth";
import { useCart } from "./context/CartContext";

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

  // null = sin filtro de categoría (el catálogo muestra todos los
  // repuestos). Los nombres de categoría los define el backend
  // (GET /api/v1/parts/categories), no el frontend.
  const [categoriaCatalogo, setCategoriaCatalogo] =
    useState(null);

  const [filtrosVehiculo, setFiltrosVehiculo] = useState({
    brand: "",
    model: "",
    year: "",
  });

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

  const [favoritos, setFavoritos] = useState(() => {
    try {
      return (
        JSON.parse(
          localStorage.getItem("autobought-favoritos")
        ) || []
      );
    } catch {
      return [];
    }
  });

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
     GUARDAR FAVORITOS
  ====================================================== */

  useEffect(() => {
    localStorage.setItem(
      "autobought-favoritos",
      JSON.stringify(favoritos)
    );
  }, [favoritos]);

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

  const irAlCatalogo = (
    categoria = null,
    vehiculo = null
  ) => {
    setCategoriaCatalogo(categoria);

    if (vehiculo) {
      setFiltrosVehiculo(vehiculo);
    } else {
      setFiltrosVehiculo({
        brand: "",
        model: "",
        year: "",
      });
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
    navigate("/");
  };

  /* =====================================================
     FAVORITOS
  ====================================================== */

  const alternarFavorito = (producto) => {
    if (!usuario) {
      navigate("/login");
      return;
    }

    setFavoritos((actual) => {
      const existe = actual.some(
        (item) => item.id === producto.id
      );

      return existe
        ? actual.filter(
            (item) => item.id !== producto.id
          )
        : [...actual, producto];
    });
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
          <Home
            {...propsNavbar}
            filtrosVehiculo={filtrosVehiculo}
          />
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
            filtrosVehiculo={filtrosVehiculo}
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
            filtrosVehiculo={filtrosVehiculo}
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
