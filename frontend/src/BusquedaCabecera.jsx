
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconoLupa } from "./Iconos";

export default function BusquedaCabecera({ inputRef, onSearch, onEscape }) {
  const [texto, setTexto] = useState("");
  const navigate = useNavigate();

  const realizarBusqueda = () => {
    const textoLimpio = texto.trim();

    if (!textoLimpio) return;

    navigate(`/catalogo?q=${encodeURIComponent(textoLimpio)}`);
    onSearch?.();
  };

  const manejarKeyDown = (event) => {
    if (event.key === "Enter") {
      realizarBusqueda();
    } else if (event.key === "Escape") {
      onEscape?.();
    }
  };

  return (
    // Mismo estilo que el buscador del catálogo (SearchBar).
    <div className="flex w-full bg-white rounded-lg overflow-hidden border border-gray-100">
      <input
        ref={inputRef}
        type="text"
        aria-label="Buscar repuestos"
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        onKeyDown={manejarKeyDown}
        placeholder="Buscar repuesto por nombre, código o fabricante..."
        className="flex-1 min-w-0 px-4 py-3 text-sm text-gray-800 outline-hidden placeholder:text-gray-400"
      />

      <button
        type="button"
        onClick={realizarBusqueda}
        aria-label="Buscar"
        className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white w-14 flex items-center justify-center transition"
      >
        <IconoLupa className="w-5 h-5" />
      </button>
    </div>
  );
}
