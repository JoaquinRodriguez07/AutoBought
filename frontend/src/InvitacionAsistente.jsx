import { useNavigate } from "react-router-dom";
import { IconoChispa } from "./Iconos";

/**
 * Invitación al asistente de compra con IA. "banda": franja del inicio;
 * "enlace": línea chica, para el encabezado del catálogo.
 */
export default function InvitacionAsistente({ variante = "banda" }) {
  const navigate = useNavigate();
  const abrir = () => navigate("/asistente");

  if (variante === "enlace") {
    return (
      <button
        type="button"
        onClick={abrir}
        className="mt-2 flex items-center gap-1.5 text-sm text-gray-300 hover:text-orange-400 transition"
      >
        <IconoChispa className="w-4 h-4 text-orange-500" />
        ¿No sabés qué repuesto necesitás? <span className="font-bold text-white">Contale al asistente →</span>
      </button>
    );
  }

  return (
    <section className="bg-orange-500">
      <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-6 flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="flex items-center gap-3 text-white">
          <span className="shrink-0 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <IconoChispa className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-lg font-black">¿No sabés qué repuesto necesitás?</h2>
            <p className="text-sm text-white/90">Contale al asistente qué le pasa a tu auto y te dice qué comprar.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={abrir}
          className="shrink-0 bg-white text-orange-600 hover:bg-orange-50 px-6 py-3 rounded-md text-sm font-black transition"
        >
          PREGUNTARLE AL ASISTENTE
        </button>
      </div>
    </section>
  );
}
