import { useState } from "react";
import { buscarTexto } from "./api";

export default function BusquedaCabecera({ onResultados }) {
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const realizarBusqueda = async () => {
    const textoLimpio = texto.trim();

    // Búsqueda vacía: no hacer nada
    if (!textoLimpio) {
      return;
    }

    setCargando(true);
    setError("");

    try {
      const resultado = await buscarTexto(textoLimpio);

      const tieneEntidades =
        resultado.entities &&
        (
          resultado.entities.part ||
          resultado.entities.brand ||
          resultado.entities.model ||
          resultado.entities.year
        );

      if (!tieneEntidades) {
        setError(
          "No pudimos entender tu búsqueda, por favor usa el filtro de compatibilidad manual"
        );
        return;
      }

      window.location.href = `/catalogo?q=${encodeURIComponent(textoLimpio)}`;
    } catch (e) {
      setError(
        e.message ||
          "No pudimos realizar la búsqueda."
      );
    } finally {
      setCargando(false);
    }
  };

  const manejarKeyDown = (event) => {
    if (event.key === "Enter") {
      realizarBusqueda();
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm">
        <input
          type="text"
          value={texto}
          onChange={(event) => {
            setTexto(event.target.value);
            setError("");
          }}
          onKeyDown={manejarKeyDown}
          placeholder="¿Qué repuesto estás buscando?"
          className="w-full outline-none text-[11px] text-gray-800 placeholder:text-gray-400"
          disabled={cargando}
        />

        <button
          type="button"
          onClick={realizarBusqueda}
          disabled={cargando}
          className="shrink-0 text-[10px] font-bold text-orange-500 hover:text-orange-600 transition disabled:opacity-50"
        >
          {cargando ? "..." : "Buscar"}
        </button>
      </div>

      {error && (
        <p className="absolute left-0 top-full mt-2 w-full text-[9px] text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}