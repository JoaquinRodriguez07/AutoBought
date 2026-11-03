import { useEffect, useRef, useState } from "react";
import CuentaLayout from "./CuentaLayout";
import { useCart } from "./context/CartContext";
import { actualizarPerfil, obtenerPerfil } from "./api";
import CambiarPassword from "./CambiarPassword";
import { IconoCarrito, IconoCorazon } from "./Iconos";
import PreferenciasMails from "./PreferenciasMails";
import SeccionCuenta, { claseBotonCancelar, claseBotonGuardar, claseBotonSeccion } from "./SeccionCuenta";
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

  const claseInput =
    "w-full mt-2 h-11 px-4 bg-white border border-gray-200 rounded-md text-sm text-gray-900 outline-hidden focus:border-orange-500 transition";

  const fila = (etiqueta, valor) => (
    <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-1 py-3 first:pt-0 last:pb-0">
      <dt className="text-sm text-gray-500">{etiqueta}</dt>
      <dd className="text-sm font-medium text-gray-900 min-w-0 break-words">{valor}</dd>
    </div>
  );

  const etiquetaCorreo =
    usuario.emailVerificado === true ? (
      <span className="ml-2 align-middle inline-block rounded-full px-2 py-0.5 text-[11px] font-bold bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">
        Verificado
      </span>
    ) : usuario.emailVerificado === false ? (
      <span className="ml-2 align-middle inline-block rounded-full px-2 py-0.5 text-[11px] font-bold bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200">
        Sin verificar
      </span>
    ) : null;

  const accesos = [
    {
      texto: "Favoritos",
      detalle: `${cantidadFavoritos} ${cantidadFavoritos === 1 ? "producto guardado" : "productos guardados"}`,
      Icono: IconoCorazon,
      ir: navegacion.onFavoritos,
    },
    {
      texto: "Carrito",
      detalle: `${cantidadCarrito} ${cantidadCarrito === 1 ? "producto" : "productos"} en tu carrito`,
      Icono: IconoCarrito,
      ir: navegacion.onCarrito,
    },
  ];

  return (
    <CuentaLayout
      {...navegacion}
      usuario={usuario}
      cantidadFavoritos={cantidadFavoritos}
      seccion="perfil"
      titulo="Información personal"
      descripcion="Tus datos, tu contraseña y los mails que recibís."
    >
      <div className="space-y-6">

        {avisoCarga && (
          <p className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-sm text-gray-600">
            No pudimos actualizar tus datos, puede que no estén al día.
          </p>
        )}

        {/* ACCESOS: favoritos y carrito */}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accesos.map(({ texto, detalle, Icono, ir }) => (
            <button
              key={texto}
              type="button"
              onClick={ir}
              className="group flex items-center gap-4 border border-gray-200 rounded-xl p-4 text-left bg-white hover:border-orange-300 transition"
            >
              <span className="w-10 h-10 shrink-0 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center">
                <Icono className="w-5 h-5" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-black text-gray-900">{texto}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{detalle}</span>
              </span>
              <span aria-hidden="true" className="text-gray-300 group-hover:text-orange-500 transition">
                →
              </span>
            </button>
          ))}
        </div>

        {/* DATOS PERSONALES */}

        <SeccionCuenta
          titulo="Datos personales"
          descripcion="Los usamos para contactarte por tus pedidos."
          idTitulo="titulo-datos-personales"
          accion={
            !editando && (
              <button type="button" onClick={iniciarEdicion} className={claseBotonSeccion}>
                EDITAR
              </button>
            )
          }
        >
          {editando ? (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                <div className="md:col-span-2">
                  <label htmlFor="perfil-nombre" className="text-xs font-bold text-gray-500">
                    NOMBRE COMPLETO
                  </label>
                  <input
                    id="perfil-nombre"
                    type="text"
                    autoComplete="name"
                    value={datos.nombre}
                    onChange={(e) => cambiarDato("nombre", e.target.value)}
                    maxLength={120}
                    className={claseInput}
                  />
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-500">CORREO ELECTRÓNICO</p>
                  <p className="mt-2 h-11 px-4 flex items-center bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-500">
                    {usuario.email || "No especificado"}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">El correo no se puede cambiar.</p>
                </div>

                <div>
                  <label htmlFor="perfil-telefono" className="text-xs font-bold text-gray-500">
                    TELÉFONO
                  </label>
                  <input
                    id="perfil-telefono"
                    type="tel"
                    autoComplete="tel"
                    value={datos.telefono}
                    onChange={(e) => cambiarDato("telefono", e.target.value)}
                    placeholder="Ej. 099 123 456"
                    className={claseInput}
                  />
                </div>

              </div>

              {error && (
                <p role="alert" className="text-red-600 text-sm mt-5">{error}</p>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={cancelarEdicion} className={claseBotonCancelar}>
                  CANCELAR
                </button>
                <button type="button" onClick={guardarCambios} disabled={guardando} className={claseBotonGuardar}>
                  {guardando ? "GUARDANDO..." : "GUARDAR CAMBIOS"}
                </button>
              </div>
            </div>
          ) : (
            <dl className="divide-y divide-gray-100">
              {fila("Nombre completo", nombreCompleto(usuario) || "No especificado")}
              {fila(
                "Correo electrónico",
                <>
                  {usuario.email || "No especificado"}
                  {etiquetaCorreo}
                </>
              )}
              {fila("Teléfono", usuario.telefono || "No especificado")}
            </dl>
          )}
        </SeccionCuenta>

        <CambiarPassword email={usuario.email} />
        <PreferenciasMails usuario={usuario} onActualizarUsuario={onActualizarUsuario} />

      </div>
    </CuentaLayout>
  );
}
