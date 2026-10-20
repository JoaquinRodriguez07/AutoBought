
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function BusquedaCabecera() {
  const [texto, setTexto] = useState("");
  const navigate = useNavigate();

  const realizarBusqueda = () => {
    const textoLimpio = texto.trim();

    if (!textoLimpio) return;

    navigate(`/catalogo?q=${encodeURIComponent(textoLimpio)}`);
  };

  const manejarKeyDown = (event) => {
    if (event.key === "Enter") {
      realizarBusqueda();
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 shadow-xs">
        <input
          type="text"
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          onKeyDown={manejarKeyDown}
          placeholder="¿Qué repuesto estás buscando?"
          className="w-full outline-hidden text-[11px] text-gray-800 placeholder:text-gray-400"
        />

        <button
          type="button"
          onClick={realizarBusqueda}
          className="shrink-0 text-[10px] font-bold text-orange-500 hover:text-orange-600 transition"
        >
          Buscar
        </button>
      </div>
    </div>
  );
}
