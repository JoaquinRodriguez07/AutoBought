import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import { useCart } from "./context/CartContext";
import { actualizarPerfil, obtenerPerfil } from "./api";

const nombreCompleto = (usuario) =>
  `${usuario.nombre || ""} ${usuario.apellido || ""}`.trim();

export default function Perfil({
  onHome,
  onCatalogo,
  onLogin,
  onMarcas,
  onCarrito,
  onFavoritos,
  cantidadFavoritos = 0,
  usuario,
  onCerrarSesion,
  onDirecciones,
  onMetodosPago,
  onHistorialCompras,
  onActualizarUsuario,
}) {
  // Los hooks van antes que cualquier `return` condicional (reglas de
  // hooks): si `usuario` es null, App.jsx ya evita montar este
  // componente (`usuario ? <Perfil .../> : null`), así que estos
  // valores por defecto de `useState` nunca llegan a usarse de verdad.
  const { cantidadCarrito } = useCart();
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const [datos, setDatos] = useState({
    nombre: nombreCompleto(usuario),
    apellido: "",
    email: usuario.email || "",
    telefono: usuario.telefono || "",
  });

  useEffect(() => {
    setDatos({
      nombre: nombreCompleto(usuario),
      apellido: "",
      email: usuario.email || "",
      telefono: usuario.telefono || "",
    });
  }, [usuario]);

  useEffect(() => {
    if (!usuario?.token) return;
    obtenerPerfil(usuario.token)
      .then((perfil) => onActualizarUsuario?.({ ...usuario, ...perfil }))
      .catch(() => {});
  }, []);

  if (!usuario) {
    return null;
  }

  const cambiarDato = (campo, valor) => {
    setDatos((actual) => ({
      ...actual,
      [campo]: valor,
    }));
  };

  const cancelarEdicion = () => {
    setDatos({
      nombre: nombreCompleto(usuario),
      apellido: "",
      email: usuario.email || "",
      telefono: usuario.telefono || "",
    });

    setError("");
    setEditando(false);
  };

  const guardarCambios = async () => {
    setGuardando(true);
    setError("");

    try {
      const perfil = await actualizarPerfil(datos);
      onActualizarUsuario?.({ ...usuario, ...perfil });
      setEditando(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-gradient-to-b from-black to-[#492202]">

      {/* =====================================================
          NAVBAR
      ====================================================== */}

      <Navbar
        paginaActual="perfil"
        onHome={onHome}
        onCatalogo={onCatalogo}
        onLogin={onLogin}
        onMarcas={onMarcas}
        onCarrito={onCarrito}
        onFavoritos={onFavoritos}
        cantidadFavoritos={cantidadFavoritos}
        usuario={usuario}
      />

      {/* =====================================================
          CONTENIDO PRINCIPAL
      ====================================================== */}

      <main className="min-h-screen flex items-center justify-center px-5 pt-24 pb-10">

        <div className="w-full max-w-[950px] bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* =================================================
              ENCABEZADO
          ================================================== */}

          <div className="bg-gray-50 border-b border-gray-200 px-8 md:px-12 py-8">

            <p className="text-orange-500 text-[9px] font-black tracking-[4px]">
              AUTOBOUGHT
            </p>

            <h1 className="text-3xl font-black italic uppercase mt-2 text-gray-900">
              MI PERFIL
            </h1>

            <p className="text-gray-400 text-[10px] mt-2">
              Administrá tus datos y tu cuenta.
            </p>

          </div>

          {/* =================================================
              CONTENIDO
          ================================================== */}

          <div className="p-6 md:p-8">

            <div className="flex flex-col md:flex-row gap-8">

              {/* =================================================
                  SELECTOR LATERAL
              ================================================== */}

              <aside className="w-full md:w-[190px] flex-shrink-0">

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-2">

                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 rounded-lg bg-orange-500 text-white text-[9px] font-bold transition"
                  >
                    INFORMACIÓN PERSONAL
                  </button>

                  <button
                    type="button"
                    onClick={onDirecciones}
                    className="w-full text-left px-4 py-3 mt-1 rounded-lg text-gray-600 hover:bg-white hover:text-orange-500 text-[9px] font-bold transition"
                  >
                    DIRECCIONES
                  </button>

                  <button
                    type="button"
                    onClick={onMetodosPago}
                    className="w-full text-left px-4 py-3 mt-1 rounded-lg text-gray-600 hover:bg-white hover:text-orange-500 text-[9px] font-bold transition"
                  >
                    MÉTODOS DE PAGO
                  </button>

                  <button
                    type="button"
                    onClick={onHistorialCompras}
                    className="w-full text-left px-4 py-3 mt-1 rounded-lg text-gray-600 hover:bg-white hover:text-orange-500 text-[9px] font-bold transition"
                  >
                    HISTORIAL DE COMPRA
                  </button>

                </div>

                <button
                  type="button"
                  onClick={onCerrarSesion}
                  className="w-full mt-4 h-10 border border-gray-200 hover:border-orange-500 hover:text-orange-500 text-gray-500 rounded-lg text-[9px] font-black transition"
                >
                  CERRAR SESIÓN
                </button>

              </aside>

              {/* =================================================
                  INFORMACIÓN PERSONAL
              ================================================== */}

              <section className="flex-1">

                {/* AVATAR + DATOS */}

                <div className="flex items-center justify-between gap-5 mb-8">

                  <div className="flex items-center gap-5">

                    <div className="w-16 h-16 rounded-full bg-orange-500 flex items-center justify-center text-white text-2xl font-black">
                      {usuario.nombre
                        ? usuario.nombre.charAt(0).toUpperCase()
                        : "U"}
                    </div>

                    <div>

                      <h2 className="text-xl font-black text-gray-900">
                        {usuario.nombre || "Usuario"}
                      </h2>

                      <p className="text-[10px] text-gray-400 mt-1">
                        {usuario.email}
                      </p>

                    </div>

                  </div>

                  {!editando && (
                    <button
                      type="button"
                      onClick={() => setEditando(true)}
                      className="h-9 px-5 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white rounded-md text-[9px] font-black transition"
                    >
                      EDITAR
                    </button>
                  )}

                </div>

                {/* =================================================
                    CAMPOS
                ================================================== */}

                <div>

                  <h3 className="text-[10px] font-black text-gray-900 uppercase mb-4">
                    Información personal
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                    {/* NOMBRE */}

                    <div className="md:col-span-2">

                      <label className="text-[9px] font-bold text-gray-500">
                        NOMBRE COMPLETO
                      </label>

                      {editando ? (
                        <input
                          type="text"
                          value={datos.nombre}
                          onChange={(e) =>
                            cambiarDato("nombre", e.target.value)
                          }
                          className="w-full mt-2 h-11 px-4 bg-white border border-gray-200 rounded-md text-[10px] text-gray-700 outline-none focus:border-orange-500 transition"
                        />
                      ) : (
                        <div className="mt-2 h-11 px-4 flex items-center bg-gray-50 border border-gray-200 rounded-md text-[10px] text-gray-700">
                          {nombreCompleto(usuario) || "No especificado"}
                        </div>
                      )}

                    </div>

                    {/* EMAIL */}

                    <div>

                      <label className="text-[9px] font-bold text-gray-500">
                        CORREO ELECTRÓNICO
                      </label>

                      <div className={`mt-2 h-11 px-4 flex items-center bg-gray-50 border border-gray-200 rounded-md text-[10px] ${editando ? "text-gray-400" : "text-gray-700"}`}>
                        {usuario.email || "No especificado"}
                      </div>

                    </div>

                    {/* TELÉFONO */}

                    <div>

                      <label className="text-[9px] font-bold text-gray-500">
                        TELÉFONO
                      </label>

                      {editando ? (
                        <input
                          type="tel"
                          value={datos.telefono}
                          onChange={(e) =>
                            cambiarDato("telefono", e.target.value)
                          }
                          placeholder="Ej. 099 123 456"
                          className="w-full mt-2 h-11 px-4 bg-white border border-gray-200 rounded-md text-[10px] text-gray-700 outline-none focus:border-orange-500 transition"
                        />
                      ) : (
                        <div className="mt-2 h-11 px-4 flex items-center bg-gray-50 border border-gray-200 rounded-md text-[10px] text-gray-700">
                          {usuario.telefono || "No especificado"}
                        </div>
                      )}

                    </div>

                  </div>

                </div>

                {/* =================================================
                    BOTONES EDICIÓN
                ================================================== */}

                {editando && error && (
                  <p className="text-red-500 text-[10px] mt-6">{error}</p>
                )}

                {editando && (
                  <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">

                    <button
                      type="button"
                      onClick={cancelarEdicion}
                      className="h-10 px-6 border border-gray-200 hover:border-gray-400 text-gray-500 rounded-md text-[9px] font-black transition"
                    >
                      CANCELAR
                    </button>

                    <button
                      type="button"
                      onClick={guardarCambios}
                      disabled={guardando}
                      className="h-10 px-6 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-md text-[9px] font-black transition"
                    >
                      {guardando ? "GUARDANDO..." : "GUARDAR CAMBIOS"}
                    </button>

                  </div>
                )}

                {/* =================================================
                    ESTADÍSTICAS
                ================================================== */}

                {!editando && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">

                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">

                      <p className="text-[8px] font-bold text-gray-400 uppercase">
                        Favoritos
                      </p>

                      <p className="text-2xl font-black text-gray-900 mt-1">
                        {cantidadFavoritos}
                      </p>

                      <p className="text-[9px] text-gray-400 mt-1">
                        Productos guardados
                      </p>

                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">

                      <p className="text-[8px] font-bold text-gray-400 uppercase">
                        Carrito
                      </p>

                      <p className="text-2xl font-black text-gray-900 mt-1">
                        {cantidadCarrito}
                      </p>

                      <p className="text-[9px] text-gray-400 mt-1">
                        Productos en tu carrito
                      </p>

                    </div>

                  </div>
                )}

              </section>

            </div>

          </div>

        </div>

      </main>

    </div>
  );
}