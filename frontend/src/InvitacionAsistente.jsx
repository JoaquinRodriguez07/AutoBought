import { useNavigate } from "react-router-dom";

import { esVendedor, obtenerSesion, sesionValida } from "./auth";
import { IconoPit } from "./Iconos";
import { usePit } from "./context/PitContext";

/**
 * Invitación a Pit, el asistente con IA. "banda": franja del inicio;
 * "enlace": línea chica, para el encabezado del catálogo; "sinResultados":
 * cuando una búsqueda del catálogo no encuentra nada, abre Pit con lo que
 * el cliente buscó (`termino`) ya escrito.
 *
 * Abre el panel de Pit al costado. Sin sesión, lleva a iniciar sesión
 * (cada consulta cuenta para el límite diario del cliente). El vendedor
 * no la ve: Pit es para comprar.
 */
export default function InvitacionAsistente({ variante = "banda", termino = "" }) {
  const navigate = useNavigate();
  const { abrir: abrirPit } = usePit();

  const sesion = obtenerSesion();
  if (esVendedor(sesion)) return null;

  const abrir = () => (sesionValida(sesion) ? abrirPit(termino) : navigate("/login"));

  if (variante === "sinResultados") {
    return (
      <div className="max-w-[460px] mx-auto -mt-10 mb-16 bg-gray-50 border border-gray-200 rounded-2xl p-5 flex items-start gap-4 text-left">
        <span className="shrink-0 w-11 h-11 rounded-xl bg-orange-500 text-white flex items-center justify-center">
          <IconoPit className="w-6 h-6" />
        </span>
        <div>
          <p className="text-sm font-black text-gray-900">¿Y si se lo contás a Pit?</p>
          <p className="text-sm text-gray-600 mt-1">
            Si buscabas por lo que le pasa al auto, Pit lo entiende y te dice qué repuestos revisar.
          </p>
          <button
            type="button"
            onClick={abrir}
            className="mt-3 h-10 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-black transition"
          >
            Preguntarle a Pit
          </button>
        </div>
      </div>
    );
  }

  if (variante === "enlace") {
    return (
      <button
        type="button"
        onClick={abrir}
        className="mt-2 flex items-center gap-1.5 text-sm text-gray-300 hover:text-orange-400 transition"
      >
        <IconoPit className="w-4 h-4 text-orange-500" />
        ¿No sabés qué repuesto necesitás? <span className="font-bold text-white">Hacé un pit stop con Pit →</span>
      </button>
    );
  }

  return (
    <section className="bg-orange-500">
      <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-6 flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="flex items-center gap-3 text-white">
          <span className="shrink-0 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <IconoPit className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-lg font-black">¿Tu auto hace algo raro?</h2>
            <p className="text-sm text-white/90">Hacé un pit stop con Pit: contale qué le pasa y te dice qué revisar y qué comprar.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={abrir}
          className="shrink-0 bg-white text-orange-600 hover:bg-orange-50 px-6 py-3 rounded-md text-sm font-black transition"
        >
          HABLAR CON PIT
        </button>
      </div>
    </section>
  );
}
