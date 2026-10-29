import Navbar from "./Navbar";

/**
 * Fondo y tarjeta de las pantallas de cuenta que se abren desde un mail
 * (recuperar contraseña, elegir una nueva, verificar el correo). Mismo
 * estilo que el login.
 */
export default function TarjetaCuenta({ titulo, subtitulo, children, ...propsNavbar }) {
  return (
    <div
      className="min-h-screen flex flex-col font-sans"
      style={{
        backgroundImage:
          "linear-gradient(rgba(0,0,0,1), rgb(73, 34, 2))",
      }}
    >
      <Navbar paginaActual="login" {...propsNavbar} />

      <main className="min-h-screen flex items-center justify-center px-5 pt-24 pb-10">
        <div className="w-full max-w-[440px] bg-white rounded-2xl shadow-2xl p-8 md:p-12">

          <p className="text-orange-500 text-[9px] font-black tracking-[4px]">
            AUTOBOUGHT
          </p>

          <h1 className="text-2xl font-black italic uppercase mt-2">
            {titulo}
          </h1>

          {subtitulo && (
            <p className="text-gray-400 text-[10px] mt-3">{subtitulo}</p>
          )}

          {children}

        </div>
      </main>
    </div>
  );
}

export const claseInputCuenta =
  "w-full mt-2 h-11 px-4 bg-gray-50 border border-gray-200 rounded-md text-[10px] outline-hidden focus:border-orange-500 transition";

export const claseBotonCuenta =
  "w-full h-11 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-[10px] font-black mt-6 transition disabled:opacity-60 disabled:cursor-not-allowed";

export const claseEnlaceCuenta =
  "text-orange-500 font-bold hover:underline";
