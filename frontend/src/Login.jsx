import { useState } from "react";
import Navbar from "./Navbar";
import { login, obtenerPerfil } from "./api";
import { decodeToken } from "./auth";

export default function Login({
  onHome,
  onCatalogo,
  onLogin,
  onMarcas,
  onCarrito,
  onFavoritos,
  cantidadCarrito,
  cantidadFavoritos,
  onIniciarSesion,
  onRegistro,
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);

  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const iniciarSesion = async (e) => {
    e.preventDefault();

    setError("");

    if (!email.trim() || !password) {
      setError("Completá el correo electrónico y la contraseña.");
      return;
    }

    setCargando(true);

    try {
      const data = await login(email.trim(), password);
      const payload = decodeToken(data.access_token);

      let sesion = {
        token: data.access_token,
        tokenType: data.token_type,
        userId: payload?.sub ?? null,
        userType: payload?.user_type ?? null,
        email: email.trim(),
      };

      // Nombre y teléfono viven en el backend. Si el perfil no carga, el
      // login igual es válido: la sesión queda sin esos datos.
      try {
        sesion = { ...sesion, ...(await obtenerPerfil(data.access_token)) };
      } catch {
        // se sigue con la sesión mínima
      }

      onIniciarSesion(sesion, remember);
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión.");
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
      {/* =====================================================
          NAVBAR
      ====================================================== */}

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

      {/* =====================================================
          CONTENIDO PRINCIPAL
      ====================================================== */}

      <main className="min-h-screen flex items-center justify-center px-5 pt-24 pb-10">

        <div className="w-full max-w-[850px] min-h-[500px] bg-white rounded-2xl overflow-hidden shadow-2xl grid grid-cols-1 md:grid-cols-2">

          {/* =================================================
              FORMULARIO
          ================================================== */}

          <form
            onSubmit={iniciarSesion}
            className="p-8 md:p-12 flex flex-col justify-center"
          >

            <p className="text-orange-500 text-[9px] font-black tracking-[4px]">
              AUTOBOUGHT
            </p>

            <h1 className="text-3xl font-black italic uppercase mt-2">
              INICIAR SESIÓN
            </h1>

            <p className="text-gray-400 text-[10px] mt-3">
              Accedé a tu cuenta para continuar.
            </p>

            {/* =================================================
                ERROR
            ================================================== */}

            {error && (
              <div className="mt-5 bg-red-50 border border-red-200 text-red-500 rounded-md px-4 py-3 text-[9px] font-semibold">
                {error}
              </div>
            )}

            {/* =================================================
                EMAIL
            ================================================== */}

            <div className="mt-8">

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

            {/* =================================================
                CONTRASEÑA
            ================================================== */}

            <div className="mt-5">

              <div className="flex justify-between items-center">

                <label className="text-[9px] font-bold text-gray-700">
                  CONTRASEÑA
                </label>

                <button
                  type="button"
                  className="text-[8px] text-orange-500 font-bold hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </button>

              </div>

              <div className="relative">

                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full mt-2 h-11 px-4 pr-12 bg-gray-50 border border-gray-200 rounded-md text-[10px] outline-none focus:border-orange-500 transition"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                  className="absolute right-3 top-[20px] text-gray-400 hover:text-orange-500 transition"
                >
                  {showPassword ? "◉" : "○"}
                </button>

              </div>

            </div>

            {/* =================================================
                RECORDAR
            ================================================== */}

            <label className="flex items-center gap-2 mt-5 cursor-pointer">

              <input
                type="checkbox"
                checked={remember}
                onChange={(e) =>
                  setRemember(e.target.checked)
                }
                className="accent-orange-500"
              />

              <span className="text-[9px] text-gray-500">
                Recordarme
              </span>

            </label>

            {/* =================================================
                BOTÓN LOGIN
            ================================================== */}

            <button
              type="submit"
              disabled={cargando}
              className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-[10px] font-black mt-6 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {cargando ? "INICIANDO SESIÓN..." : "INICIAR SESIÓN"}
            </button>

            {/* =================================================
                SEPARADOR
            ================================================== */}

            <div className="flex items-center gap-3 my-6">

              <div className="flex-1 h-px bg-gray-200" />

              <span className="text-[8px] text-gray-400">
                O
              </span>

              <div className="flex-1 h-px bg-gray-200" />

            </div>

            {/* =================================================
                REGISTRO
            ================================================== */}

            <p className="text-center text-[9px] text-gray-500">

              ¿Todavía no tenés una cuenta?

              <button
                type="button"
                onClick={onRegistro}
                className="text-orange-500 font-bold ml-1 hover:underline"
              >
                Registrate
              </button>

            </p>

          </form>

          {/* =================================================
              PANEL DERECHO / IMAGEN
          ================================================== */}

          <div className="hidden md:block relative overflow-hidden">

            <img
              src="/src/assets/repuestos.jpg"
              alt="AutoBought"
              className="absolute inset-0 w-full h-full object-cover"
            />

            <div className="absolute inset-0 bg-black/45" />

            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

            <div className="absolute bottom-10 left-8 right-8">

              <p className="text-orange-500 text-[9px] font-black tracking-[4px]">
                REPUESTOS PARA SEGUIR AVANZANDO
              </p>

              <h2 className="text-white text-3xl font-black italic uppercase mt-3 leading-none">
                CALIDAD.
                <br />
                MOVIMIENTO.
                <br />
                CONFIANZA.
              </h2>

              <div className="w-10 h-[2px] bg-orange-500 mt-5" />

              <p className="text-white/60 text-[9px] mt-4">
                Siempre contigo.
              </p>

            </div>

          </div>

        </div>

      </main>

    </div>
  );
}