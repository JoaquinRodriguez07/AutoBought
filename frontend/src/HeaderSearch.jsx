// Buscador de la barra de navegación.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SearchIcon } from "./Icons";

export default function HeaderSearch({ inputRef, onSearch, onEscape }) {
  const [texto, setText] = useState("");
  const navigate = useNavigate();

  const performSearch = () => {
    const cleanText = texto.trim();

    if (!cleanText) return;

    navigate(`/catalogo?q=${encodeURIComponent(cleanText)}`);
    onSearch?.();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      performSearch();
    } else if (event.key === "Escape") {
      onEscape?.();
    }
  };

  return (
    // Mismo estilo que el buscador del catálogo (SearchBar).
    <div className="flex w-full bg-white rounded-lg overflow-hidden border border-gray-100 focus-within:ring-2 focus-within:ring-orange-500 transition">
      <input
        ref={inputRef}
        type="text"
        aria-label="Buscar repuestos"
        value={texto}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Buscar repuesto por nombre, código o fabricante..."
        className="flex-1 min-w-0 px-4 py-3 text-sm text-gray-800 outline-hidden placeholder:text-gray-400"
      />

      <button
        type="button"
        onClick={performSearch}
        aria-label="Buscar"
        className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white w-14 flex items-center justify-center transition outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
      >
        <SearchIcon className="w-5 h-5" />
      </button>
    </div>
  );
}
