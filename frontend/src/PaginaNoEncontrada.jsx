import Navbar from "./Navbar";

/**
 * PaginaNoEncontrada
 * ==========================================
 * Se muestra para cualquier dirección que no coincide con ninguna
 * ruta de App.jsx (ruta comodín "*"). Sin ella, una URL mal escrita
 * o un link viejo dejaban la pantalla en blanco.
 *
 * Recibe las mismas props que la Navbar (propsNavbar de App.jsx).
 */
export default function PaginaNoEncontrada(propsNavbar) {
  const { onHome, onCatalogo } = propsNavbar;

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <Navbar {...propsNavbar} />

      <main className="pt-[105px] max-w-[1100px] mx-auto px-5 pb-14">
        <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-16 text-center">
          <p className="text-orange-500 text-5xl font-black">404</p>
          <h1 className="text-xl font-black mt-4">Esta página no existe</h1>
          <p className="text-[10px] text-gray-400 mt-2">
            Puede que el link esté mal escrito o que la página se haya movido.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={onHome}
              className="bg-orange-500 hover:bg-orange-600 text-white px-7 py-3 rounded-md text-[10px] font-black"
            >
              VOLVER AL INICIO
            </button>
            <button
              onClick={() => onCatalogo()}
              className="border border-gray-300 hover:border-orange-500 px-7 py-3 rounded-md text-[10px] font-black"
            >
              VER REPUESTOS
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
