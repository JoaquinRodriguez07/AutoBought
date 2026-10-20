import { useState } from "react";
import Navbar from "./Navbar";
import { registrar as registrarEnApi } from "./api";
import { decodeToken } from "./auth";
import ErrorCampo from "./ErrorCampo";
import { conError, propsError } from "./erroresCampo";
import { formatearTelefonoUY, normalizarTelefonoUY } from "./telefono";
import { NOMBRE_MAX, limpiar, validarRegistro } from "./validaciones";

// Campos del backend → campos del formulario, para mostrar sus errores 422.
const CAMPOS_API = { name: "nombre", email: "email", phone: "telefono", password: "password" };

const claseInput =
  "w-full mt-2 h-11 px-4 bg-gray-50 border border-gray-200 rounded-md text-[10px] outline-hidden focus:border-orange-500 transition";

export default function Registro({
  onHome,
  onCatalogo,
  onLogin,
  onMarcas,
  onCarrito,
  onFavoritos,
  cantidadCarrito,
  cantidadFavoritos,
  onRegistroExitoso,
}) {
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [password, setPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [aceptaTerminos, setAceptaTerminos] = useState(false);

  const [error, setError] = useState("");
  const [errores, setErrores] = useState({});
  const [cargando, setCargando] = useState(false);

  // Al editar un campo se borra su error.
  const cambiar = (campo, setter) => (e) => {
    setter(campo === "terminos" ? e.target.checked : e.target.value);
    setErrores((actuales) => ({ ...actuales, [campo]: undefined }));
  };

  const registrar = async (e) => {
    e.preventDefault();
    setError("");

    const erroresFormulario = validarRegistro({
      nombre,
      apellido,
      email,
      telefono,
      password,
      confirmarPassword,
      aceptaTerminos,
    });
    setErrores(erroresFormulario);
    if (Object.keys(erroresFormulario).length > 0) return;

    setCargando(true);

    try {
      const data = await registrarEnApi({
        nombre: limpiar(nombre),
        apellido: limpiar(apellido),
        email: email.trim(),
        telefono: telefono.trim(),
        password,
      });
      const payload = decodeToken(data.access_token);

      onRegistroExitoso({
        token: data.access_token,
        tokenType: data.token_type,
        userId: payload?.sub ?? null,
        userType: payload?.user_type ?? null,
        // Misma forma que devuelve obtenerPerfil() al iniciar sesión:
        // el backend guarda nombre + apellido en un solo campo.
        nombre: `${limpiar(nombre)} ${limpiar(apellido)}`,
        apellido: "",
        email: email.trim().toLowerCase(),
        telefono: formatearTelefonoUY(normalizarTelefonoUY(telefono)),
        // Recién registrado: el mail de verificación acaba de salir.
        emailVerificado: false,
      });
    } catch (err) {
      const campos = Object.fromEntries(
        Object.entries(err.campos || {})
          .filter(([campo]) => CAMPOS_API[campo])
          .map(([campo, mensaje]) => [CAMPOS_API[campo], mensaje])
      );
      if (Object.keys(campos).length > 0) setErrores(campos);
      else setError(err.message || "No pudimos crear tu cuenta.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col font-sans"
      style={{
        backgroundImage:
          "linear-gradient(rgba(0,0,0,1), rgb(73, 34, 2))",
      }}
    >
      <Navbar
        paginaActual="login"
        onHome={onHome}
        onCatalogo={onCatalogo}
        onLogin={onLogin}
        onMarcas={onMarcas}
        onCarrito={onCarrito}
        onFavoritos={onFavoritos}
        cantidadCarrito={cantidadCarrito}
        cantidadFavoritos={cantidadFavoritos}
      />

      <main className="min-h-screen flex items-center justify-center px-5 pt-24 pb-10">

        <div className="w-full max-w-[900px] bg-white rounded-2xl overflow-hidden shadow-2xl">

          <form
            onSubmit={registrar}
            noValidate
            className="p-8 md:p-12"
          >

            <p className="text-orange-500 text-[9px] font-black tracking-[4px]">
              AUTOBOUGHT
            </p>

            <h1 className="text-3xl font-black italic uppercase mt-2">
              CREAR CUENTA
            </h1>

            <p className="text-gray-400 text-[10px] mt-3">
              Registrate para poder comprar y guardar tus productos.
            </p>

            {error && (
              <div className="mt-5 bg-red-50 border border-red-200 text-red-500 rounded-md px-4 py-3 text-[9px] font-semibold">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-8">

              <div>
                <label className="text-[9px] font-bold text-gray-700">
                  NOMBRE
                </label>

                <input
                  type="text"
                  value={nombre}
                  onChange={cambiar("nombre", setNombre)}
                  placeholder="Tu nombre"
                  maxLength={NOMBRE_MAX}
                  autoComplete="given-name"
                  className={conError(claseInput, errores.nombre)}
                  {...propsError("nombre", errores.nombre)}
                />
                <ErrorCampo campo="nombre" mensaje={errores.nombre} />
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-700">
                  APELLIDO
                </label>

                <input
                  type="text"
                  value={apellido}
                  onChange={cambiar("apellido", setApellido)}
                  placeholder="Tu apellido"
                  maxLength={NOMBRE_MAX}
                  autoComplete="family-name"
                  className={conError(claseInput, errores.apellido)}
                  {...propsError("apellido", errores.apellido)}
                />
                <ErrorCampo campo="apellido" mensaje={errores.apellido} />
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-700">
                  CORREO ELECTRÓNICO
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={cambiar("email", setEmail)}
                  placeholder="tu@email.com"
                  maxLength={254}
                  autoComplete="email"
                  className={conError(claseInput, errores.email)}
                  {...propsError("email", errores.email)}
                />
                <ErrorCampo campo="email" mensaje={errores.email} />
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-700">
                  TELÉFONO
                </label>

                <input
                  type="tel"
                  value={telefono}
                  onChange={cambiar("telefono", setTelefono)}
                  placeholder="099 123 456"
                  maxLength={30}
                  autoComplete="tel"
                  className={conError(claseInput, errores.telefono)}
                  {...propsError("telefono", errores.telefono)}
                />
                <ErrorCampo campo="telefono" mensaje={errores.telefono} />
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-700">
                  CONTRASEÑA
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={cambiar("password", setPassword)}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  className={conError(claseInput, errores.password)}
                  {...propsError("password", errores.password)}
                />
                {errores.password ? (
                  <ErrorCampo campo="password" mensaje={errores.password} />
                ) : (
                  <p className="text-gray-400 text-[8px] mt-1">
                    Al menos una letra y un número.
                  </p>
                )}
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-700">
                  CONFIRMAR CONTRASEÑA
                </label>

                <input
                  type="password"
                  value={confirmarPassword}
                  onChange={cambiar("confirmarPassword", setConfirmarPassword)}
                  placeholder="Repetí tu contraseña"
                  autoComplete="new-password"
                  className={conError(claseInput, errores.confirmarPassword)}
                  {...propsError("confirmarPassword", errores.confirmarPassword)}
                />
                <ErrorCampo campo="confirmarPassword" mensaje={errores.confirmarPassword} />
              </div>

            </div>

            <label className="flex items-center gap-2 mt-6 cursor-pointer">

              <input
                type="checkbox"
                checked={aceptaTerminos}
                onChange={cambiar("terminos", setAceptaTerminos)}
                className="accent-orange-500"
                {...propsError("terminos", errores.terminos)}
              />

              <span className="text-[9px] text-gray-500">
                Acepto los términos y condiciones.
              </span>

            </label>

            <ErrorCampo campo="terminos" mensaje={errores.terminos} />

            <button
              type="submit"
              disabled={cargando}
              className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-[10px] font-black mt-6 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {cargando ? "CREANDO CUENTA..." : "CREAR CUENTA"}
            </button>

            <p className="text-center text-[9px] text-gray-500 mt-6">

              ¿Ya tenés una cuenta?

              <button
                type="button"
                onClick={onLogin}
                className="text-orange-500 font-bold ml-1 hover:underline"
              >
                Iniciá sesión
              </button>

            </p>

          </form>

        </div>

      </main>
    </div>
  );
}