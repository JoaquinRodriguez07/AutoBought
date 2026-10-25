import { useNavigate } from "react-router-dom";

import ChatPit from "./ChatPit";
import EncabezadoPagina from "./EncabezadoPagina";
import Navbar from "./Navbar";
import { usePit } from "./context/PitContext";

/**
 * Página de Pit, el asistente de compra con IA (HU 6.1). El cliente cuenta
 * con sus palabras qué le pasa al auto y conversa con Pit, que le da un
 * diagnóstico breve y repuestos compatibles con su vehículo. Los repuestos
 * los elige el backend (existen, son compatibles y tienen stock); la IA solo
 * interpreta el síntoma.
 *
 * Es la misma conversación que la del panel flotante (PitContext): lo que
 * se habló en uno se ve en el otro.
 */
export default function Asistente({ onDetalle, onCarrito, onHome, ...propsNavbar }) {
  const navigate = useNavigate();
  const { vehiculo, conversacion } = usePit();

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <Navbar paginaActual="asistente" onHome={onHome} onCarrito={onCarrito} {...propsNavbar} />

      <main>
        <EncabezadoPagina
          migas={[{ texto: "Inicio", ir: onHome }, "Pit"]}
          titulo="Pit, tu mecánico con IA"
          descripcion="Contale con tus palabras qué le pasa a tu auto y te dice qué revisar y qué repuestos le sirven."
        />

        <div className="max-w-[860px] mx-auto px-4 md:px-10 py-8 box-content">
          <div className="h-[min(760px,calc(100vh-180px))] min-h-[560px] border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <ChatPit
              vehiculo={vehiculo}
              conversacion={conversacion}
              onDetalle={onDetalle}
              onElegirVehiculo={onHome}
              onBuscarEnCatalogo={(consulta) => navigate(`/catalogo?q=${encodeURIComponent(consulta)}`)}
              onVerCarrito={onCarrito}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
