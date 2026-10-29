import Navbar from "../Navbar";

// El dashboard es una app de Streamlit aparte (carpeta analitica/ del repo).
// En local corre en el puerto 8501; en otro entorno se configura con
// VITE_DASHBOARD_URL.
export const DASHBOARD_URL =
  import.meta.env.VITE_DASHBOARD_URL || "http://localhost:8501";

// Portal del vendedor: la entrada al dashboard de stock y ventas.
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

        <section className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-8 md:p-10">
          <h2 className="text-xl font-black">Dashboard de stock y ventas</h2>
          <p className="text-xs text-gray-500 mt-2 max-w-[560px]">
            Consultá el stock actual de cada repuesto, cuáles tienen stock bajo,
            cuáles son los más vendidos y cómo evolucionan las ventas mes a mes,
            con los datos registrados en el sistema. Se ingresa con esta misma
            cuenta de vendedor.
          </p>
          <a
            href={DASHBOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center mt-6 h-10 px-6 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-xs font-black transition"
          >
            ABRIR DASHBOARD
          </a>
        </section>
      </main>
    </div>
  );
}
