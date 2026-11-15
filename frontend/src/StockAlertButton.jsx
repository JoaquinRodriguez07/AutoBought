/**
 * «Avisame cuando haya» en un repuesto sin stock. Con el aviso ya pedido
 * muestra «Te vamos a avisar», y tocarlo lo cancela. El estado y la
 * llamada a la API viven en App.jsx (igual que los favoritos).
 */
export default function StockAlertButton({ product, hasNotice, onToggleNotice, className = "" }) {
  if (!onToggleNotice || product.stock !== 0) return null;

  return (
    <button
      type="button"
      onClick={() => onToggleNotice(product)}
      aria-pressed={hasNotice}
      title={hasNotice ? "Tocá para cancelar el aviso" : "Te mandamos un mail cuando vuelva a haber stock"}
      className={`text-xs font-bold underline hover:no-underline ${
        hasNotice ? "text-green-600" : "text-orange-500"
      } ${className}`}
    >
      {hasNotice ? "✓ Te vamos a avisar" : "🔔 Avisame cuando haya"}
    </button>
  );
}
