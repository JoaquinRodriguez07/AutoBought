import { useEffect, useRef, useState } from "react";
import CuentaLayout from "./CuentaLayout";
import { useCart } from "./context/CartContext";
import { actualizarPerfil, obtenerPerfil } from "./api";
import CambiarPassword from "./CambiarPassword";
import PreferenciasMails from "./PreferenciasMails";
import { MENSAJE_TELEFONO, normalizarTelefonoUY } from "./telefono";
import { limpiar, validarNombrePersona } from "./validaciones";

const nombreCompleto = (usuario) =>
  `${usuario.nombre || ""} ${usuario.apellido || ""}`.trim();

export default function Perfil({
  usuario,
  onActualizarUsuario,
  cantidadFavoritos = 0,
  // Navegación (Navbar y menú de la cuenta): la usa CuentaLayout.
  ...navegacion
}) {
  // Los hooks van antes que cualquier `return` condicional (reglas de
  // hooks): si `usuario` es null, App.jsx ya evita montar este
  // componente (`usuario ? <Perfil .../> : null`), así que estos
  // valores por defecto de `useState` nunca llegan a usarse de verdad.
  const { cantidadCarrito } = useCart();
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [avisoCarga, setAvisoCarga] = useState(false);
  const huboCambiosLocales = useRef(false);

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

    let desmontado = false;
    obtenerPerfil(usuario.token)
      .then((perfil) => {
        if (desmontado || huboCambiosLocales.current) return;
        onActualizarUsuario?.({ ...usuario, ...perfil });
      })
      .catch(() => {
        if (!desmontado) setAvisoCarga(true);
      });

    return () => {
      desmontado = true;
    };
  }, []);

  if (!usuario) {
    return null;
  }

  const iniciarEdicion = () => {
    huboCambiosLocales.current = true;
    setEditando(true);
  };

  const cambiarDato = (campo, valor) => {
    setError("");
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
    // El teléfono se puede cambiar pero no borrar.
    const errorDatos =
      validarNombrePersona(datos.nombre) ||
      (!limpiar(datos.telefono)
        ? "Ingresá tu teléfono."
        : normalizarTelefonoUY(datos.telefono)
          ? null
          : MENSAJE_TELEFONO);
    if (errorDatos) {
      setError(errorDatos);
      return;
    }

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
    <CuentaLayout
      {...navegacion}
      usuario={usuario}
      cantidadFavoritos={cantidadFavoritos}
      seccion="perfil"
      titulo="Información personal"
      descripcion="Tus datos, tu contraseña y los mails que recibís."
      accion={
        !editando && (
          <button
            type="button"
            onClick={iniciarEdicion}
            className="h-9 px-5 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white rounded-md text-xs font-black transition"
          >
            EDITAR
          </button>
        )
      }
    >

      {/* =================================================
          CAMPOS
      ================================================== */}

      <div>

        {avisoCarga && (
          <p className="text-sm text-gray-400 -mt-2 mb-4">
            No pudimos actualizar tus datos, puede que no estén al día.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* NOMBRE */}

          <div className="md:col-span-2">

            <label className="text-xs font-bold text-gray-500">
              NOMBRE COMPLETO
            </label>

            {editando ? (
              <input
                type="text"
                value={datos.nombre}
                onChange={(e) =>
                  cambiarDato("nombre", e.target.value)
                }
                maxLength={120}
                className="w-full mt-2 h-11 px-4 bg-white border border-gray-200 rounded-md text-sm text-gray-700 outline-hidden focus:border-orange-500 transition"
              />
            ) : (
              <div className="mt-2 h-11 px-4 flex items-center bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700">
                {nombreCompleto(usuario) || "No especificado"}
              </div>
            )}

          </div>

          {/* EMAIL */}

          <div>

            <label className="text-xs font-bold text-gray-500">
              CORREO ELECTRÓNICO
            </label>

            <div className={`mt-2 h-11 px-4 flex items-center bg-gray-50 border border-gray-200 rounded-md text-sm ${editando ? "text-gray-400" : "text-gray-700"}`}>
              {usuario.email || "No especificado"}
            </div>

          </div>

          {/* TELÉFONO */}

          <div>

            <label className="text-xs font-bold text-gray-500">
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
                className="w-full mt-2 h-11 px-4 bg-white border border-gray-200 rounded-md text-sm text-gray-700 outline-hidden focus:border-orange-500 transition"
              />
            ) : (
              <div className="mt-2 h-11 px-4 flex items-center bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700">
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
        <p className="text-red-500 text-sm mt-6">{error}</p>
      )}

      {editando && (
        <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">

          <button
            type="button"
            onClick={cancelarEdicion}
            className="h-10 px-6 border border-gray-200 hover:border-gray-400 text-gray-500 rounded-md text-xs font-black transition"
          >
            CANCELAR
          </button>

          <button
            type="button"
            onClick={guardarCambios}
            disabled={guardando}
            className="h-10 px-6 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-md text-xs font-black transition"
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

            <p className="text-[11px] font-bold text-gray-400 uppercase">
              Favoritos
            </p>

            <p className="text-2xl font-black text-gray-900 mt-1">
              {cantidadFavoritos}
            </p>

            <p className="text-xs text-gray-400 mt-1">
              Productos guardados
            </p>

          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">

            <p className="text-[11px] font-bold text-gray-400 uppercase">
              Carrito
            </p>

            <p className="text-2xl font-black text-gray-900 mt-1">
              {cantidadCarrito}
            </p>

            <p className="text-xs text-gray-400 mt-1">
              Productos en tu carrito
            </p>

          </div>

        </div>
      )}

      {!editando && <CambiarPassword email={usuario.email} />}
      {!editando && (
        <PreferenciasMails usuario={usuario} onActualizarUsuario={onActualizarUsuario} />
      )}

    </CuentaLayout>
  );
}
