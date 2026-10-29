/**
 * «Avisame cuando haya» en un repuesto sin stock. Con el aviso ya pedido
 * muestra «Te vamos a avisar», y tocarlo lo cancela. El estado y la
 * llamada a la API viven en App.jsx (igual que los favoritos).
 */
export default function BotonAvisoStock({ producto, tieneAviso, onAlternarAviso, className = "" }) {
  if (!onAlternarAviso || producto.stock !== 0) return null;

  return (
    <button
      type="button"
      onClick={() => onAlternarAviso(producto)}
      aria-pressed={tieneAviso}
      title={tieneAviso ? "Tocá para cancelar el aviso" : "Te mandamos un mail cuando vuelva a haber stock"}
      className={`text-[9px] font-bold underline hover:no-underline ${
        tieneAviso ? "text-green-600" : "text-orange-500"
      } ${className}`}
    >
      {tieneAviso ? "✓ Te vamos a avisar" : "🔔 Avisame cuando haya"}
    </button>
  );
}
