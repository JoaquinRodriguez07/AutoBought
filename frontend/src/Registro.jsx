import { useState } from "react";
import Navbar from "./Navbar";
import { registrar as registrarEnApi } from "./api";
import { decodeToken } from "./auth";
import {
  MENSAJE_TELEFONO,
  formatearTelefonoUY,
  normalizarTelefonoUY,
} from "./telefono";

const PASSWORD_MIN = 8;
// Mismo criterio mínimo que EmailStr del backend: algo@dominio.tld
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [cargando, setCargando] = useState(false);

  const registrar = async (e) => {
    e.preventDefault();
    setError("");

    if (
      !nombre.trim() ||
      !apellido.trim() ||
      !email.trim() ||
      !telefono.trim() ||
      !password ||
      !confirmarPassword
    ) {
      setError("Completá todos los campos.");
      return;
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      setError("Ingresá un correo electrónico válido.");
      return;
    }

    if (!normalizarTelefonoUY(telefono)) {
      setError(MENSAJE_TELEFONO);
      return;
    }

    if (password.length < PASSWORD_MIN) {
      setError(
        `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`
      );
      return;
    }

    if (password !== confirmarPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    if (!aceptaTerminos) {
      setError("Tenés que aceptar los términos y condiciones.");
      return;
    }

    setCargando(true);

    try {
      const data = await registrarEnApi({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
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
        nombre: `${nombre.trim()} ${apellido.trim()}`,
        apellido: "",
        email: email.trim().toLowerCase(),
        telefono: formatearTelefonoUY(normalizarTelefonoUY(telefono)),
      });
    } catch (err) {
      setError(err.message || "No pudimos crear tu cuenta.");
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
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full mt-2 h-11 px-4 bg-gray-50 border border-gray-200 rounded-md text-[10px] outline-none focus:border-orange-500 transition"
                />
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-700">
                  APELLIDO
                </label>

                <input
                  type="text"
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  placeholder="Tu apellido"
                  className="w-full mt-2 h-11 px-4 bg-gray-50 border border-gray-200 rounded-md text-[10px] outline-none focus:border-orange-500 transition"
                />
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-700">
                  CORREO ELECTRÓNICO
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full mt-2 h-11 px-4 bg-gray-50 border border-gray-200 rounded-md text-[10px] outline-none focus:border-orange-500 transition"
                />
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-700">
                  TELÉFONO
                </label>

                <input
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="099 123 456"
                  className="w-full mt-2 h-11 px-4 bg-gray-50 border border-gray-200 rounded-md text-[10px] outline-none focus:border-orange-500 transition"
                />
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-700">
                  CONTRASEÑA
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full mt-2 h-11 px-4 bg-gray-50 border border-gray-200 rounded-md text-[10px] outline-none focus:border-orange-500 transition"
                />
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-700">
                  CONFIRMAR CONTRASEÑA
                </label>

                <input
                  type="password"
                  value={confirmarPassword}
                  onChange={(e) =>
                    setConfirmarPassword(e.target.value)
                  }
                  placeholder="Repetí tu contraseña"
                  className="w-full mt-2 h-11 px-4 bg-gray-50 border border-gray-200 rounded-md text-[10px] outline-none focus:border-orange-500 transition"
                />
              </div>

            </div>

            <label className="flex items-center gap-2 mt-6 cursor-pointer">

              <input
                type="checkbox"
                checked={aceptaTerminos}
                onChange={(e) =>
                  setAceptaTerminos(e.target.checked)
                }
                className="accent-orange-500"
              />

              <span className="text-[9px] text-gray-500">
                Acepto los términos y condiciones.
              </span>

            </label>

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