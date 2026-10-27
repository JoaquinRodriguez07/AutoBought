import { useEffect, useState } from "react";
import { IconoCerrar, IconoLupa } from "./Iconos";

/**
 * SearchBar
 * ==========================================
 * Campo de búsqueda reutilizable para encontrar repuestos por
 * nombre o código, sin necesidad de ingresar el código completo.
 *
 * - `value` / `onChange`: filtrado en vivo mientras el cliente escribe
 *   (controla el estado del texto ingresado).
 * - `onSubmit`: se dispara al presionar Enter o al hacer click en el
 *   botón de buscar. Útil para disparar una búsqueda explícita
 *   (por ejemplo, contra el backend vía `?search=` o `?q=`).
 *
 * Props:
 *  - value       (string)   valor controlado del input
 *  - onChange    (fn)       (nuevoValor: string) => void
 *  - onSubmit    (fn)       opcional, (valor: string) => void
 *  - placeholder (string)   opcional
 *  - autoFocus   (bool)     opcional
 *  - className   (string)   opcional, extiende el contenedor
 *  - inputId     (string)   opcional, id del input (para enfocarlo desde afuera)
 */
// El buscador del catálogo: la lupa de la barra lo enfoca en vez de abrir
// otro buscador encima.
export const ID_BUSCADOR_CATALOGO = "buscador-catalogo";

export default function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = "Buscar repuesto por nombre o código...",
  autoFocus = false,
  className = "",
  inputId,
}) {
  // Estado interno para permitir uso "no controlado" si no se pasa `value`.
  const [interno, setInterno] = useState(value ?? "");

  useEffect(() => {
    if (value !== undefined) {
      setInterno(value);
    }
  }, [value]);

  const actualizar = (nuevoValor) => {
    setInterno(nuevoValor);
    onChange?.(nuevoValor);
  };

  const buscar = () => {
    onSubmit?.(interno);
  };

  const manejarTecla = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      buscar();
    }
  };

  const limpiar = () => {
    actualizar("");
    onSubmit?.("");
  };

  return (
    <div
      role="search"
      className={`flex w-full bg-white rounded-lg shadow-xs overflow-hidden border border-gray-100 focus-within:ring-2 focus-within:ring-orange-500 transition ${className}`}
    >
      <input
        id={inputId}
        value={interno}
        onChange={(e) => actualizar(e.target.value)}
        onKeyDown={manejarTecla}
        type="search"
        autoFocus={autoFocus}
        aria-label="Buscar repuesto por nombre o código"
        placeholder={placeholder}
        className="flex-1 min-w-0 px-4 py-3 text-sm outline-hidden [&::-webkit-search-cancel-button]:appearance-none"
      />

      {interno && (
        <button
          type="button"
          onClick={limpiar}
          aria-label="Limpiar búsqueda"
          className="px-3 text-gray-400 hover:text-gray-600"
        >
          <IconoCerrar />
        </button>
      )}

      <button
        type="button"
        onClick={buscar}
        aria-label="Buscar"
        className="bg-orange-500 hover:bg-orange-600 text-white w-14 flex items-center justify-center transition"
      >
        <IconoLupa className="w-5 h-5" />
      </button>
    </div>
  );
}
