/**
 * SinResultadosBusqueda
 * ==========================================
 * Componente de retroalimentación que se muestra cuando una búsqueda
 * de repuestos no devuelve ningún resultado (arreglo vacío), con
 * sugerencias para buscar de otra forma.
 *
 * Props:
 *  - termino        (string): el texto que ingresó el cliente en el buscador.
 *  - onBuscarEnTodo (fn)     opcional: si viene, ofrece hacer la búsqueda
 *                             inteligente del servidor con ese texto.
 */
export default function NoSearchResults({ termino, onSearchInEverything }) {
  return (
    <div
      role="status"
      className="py-20 text-center text-gray-400 text-sm"
    >
      No encontramos repuestos para “<span className="font-bold text-gray-500">{termino}</span>”.

      <ul aria-label="Sugerencias" className="mt-4 space-y-1 text-xs text-gray-500">
        <li>Revisá cómo está escrito o probá con menos palabras.</li>
        <li>Buscá por el tipo de repuesto (por ejemplo, «pastillas de freno» o «filtro de aceite»).</li>
        <li>Elegí una categoría o tu vehículo en los filtros.</li>
      </ul>

      {onSearchInEverything && (
        <div className="mt-5">
          <button
            type="button"
            onClick={onSearchInEverything}
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-md px-5 h-10 text-sm font-bold transition"
          >
            Buscar "{termino}" en todo el catálogo →
          </button>
        </div>
      )}
    </div>
  );
}
