/**
 * Marca del fabricante sobre la foto del repuesto ("BOSCH"). Las imágenes
 * son genéricas y sin logos: la marca va como texto de la página, no
 * dibujada en la imagen. Arriba a la izquierda, porque a la derecha está
 * el corazón de favoritos.
 */
export default function ChipFabricante({ fabricante, className = "" }) {
  if (!fabricante) return null;

  return (
    <span
      className={`absolute top-3 left-3 rounded-md border border-gray-200 bg-white/90 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-gray-800 shadow-xs ${className}`}
    >
      {fabricante}
    </span>
  );
}
