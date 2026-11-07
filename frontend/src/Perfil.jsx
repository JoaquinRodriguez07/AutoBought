// Pantalla del perfil del cliente.

import { useEffect, useRef, useState } from "react";
import CuentaLayout from "./CuentaLayout";
import { actualizarPerfil, obtenerPerfil } from "./api";
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

  // Si cambia el usuario (ej. se renovó la sesión) mientras se edita, no se
  // pisa lo que el cliente está escribiendo.
  useEffect(() => {
    if (editando) return;
    setDatos({
      nombre: nombreCompleto(usuario),
      apellido: "",
      email: usuario.email || "",
      telefono: usuario.telefono || "",
    });
  }, [usuario, editando]);

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
    // Solo al entrar al perfil: trae los datos frescos una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <span className="ml-2 align-middle inline-block rounded-full px-2 py-0.5 text-xs font-bold bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">
        Verificado
      </span>
    ) : usuario.emailVerificado === false ? (
      <span className="ml-2 align-middle inline-block rounded-full px-2 py-0.5 text-xs font-bold bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200">
        Sin verificar
      </span>
    ) : null;

  return (
    <CuentaLayout
      {...navegacion}
      usuario={usuario}
      cantidadFavoritos={cantidadFavoritos}
      seccion="datos"
      titulo="Mis datos"
      descripcion="Los usamos para contactarte por tus pedidos."
    >
      <div className="space-y-6">

        {avisoCarga && (
          <p className="bg-white border border-gray-200 rounded-md px-4 py-3 text-sm text-gray-600">
            No pudimos actualizar tus datos, puede que no estén al día.
          </p>
        )}

        {/* DATOS PERSONALES */}

        <SeccionCuenta
          titulo="Datos personales"
          idTitulo="titulo-datos-personales"
          accion={
            !editando && (
              <button type="button" onClick={iniciarEdicion} className={claseBotonSeccion}>
                Editar
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
                  Cancelar
                </button>
                <button type="button" onClick={guardarCambios} disabled={guardando} className={claseBotonGuardar}>
                  {guardando ? "Guardando..." : "Guardar cambios"}
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

      </div>
    </CuentaLayout>
  );
}
