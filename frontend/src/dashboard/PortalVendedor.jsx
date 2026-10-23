import Navbar from "../Navbar";

// Placeholder del portal del vendedor. El contenido real (SCRUM-25) vive en
// esta carpeta; mientras tanto solo muestra el saludo de la sesión.
export default function PortalVendedor({
  usuario,
  onHome,
  onCatalogo,
  onLogin,
  onMarcas,
  onCerrarSesion,
}) {
  const nombre = usuario?.nombre || usuario?.email || "";

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <Navbar
        paginaActual="dashboard"
        usuario={usuario}
        onHome={onHome}
        onCatalogo={onCatalogo}
        onLogin={onLogin}
        onMarcas={onMarcas}
        onCerrarSesion={onCerrarSesion}
      />

      <main className="pt-[105px] max-w-[1100px] mx-auto px-5 pb-14">
        <p className="text-orange-500 text-[9px] font-black tracking-[4px]">
          AUTOBOUGHT
        </p>

        <h1 className="text-3xl md:text-4xl font-black italic uppercase mt-1">
          Portal del vendedor
        </h1>

        <p className="text-[10px] text-gray-500 mt-2">
          Hola{nombre ? `, ${nombre}` : ""}.
        </p>

        <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-16 text-center">
          <h2 className="text-xl font-black">Dashboard</h2>
          <p className="text-[10px] text-gray-400 mt-2">
            El dashboard estará disponible pronto.
          </p>
        </div>
      </main>
    </div>
  );
}
