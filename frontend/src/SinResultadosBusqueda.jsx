/**
 * SinResultadosBusqueda
 * ==========================================
 * Componente de retroalimentación que se muestra cuando una búsqueda
 * de repuestos no devuelve ningún resultado (arreglo vacío).
 *
 * Props:
 *  - termino        (string): el texto que ingresó el cliente en el buscador.
 *  - onBuscarEnTodo (fn)     opcional: si viene, ofrece hacer la búsqueda
 *                             inteligente del servidor con ese texto.
 */
export default function SinResultadosBusqueda({ termino, onBuscarEnTodo }) {
  return (
    <div
      role="status"
      className="py-20 text-center text-gray-400 text-sm"
    >
      No encontramos repuestos coincidentes con la búsqueda '
      <span className="font-bold text-gray-500">{termino}</span>'

      {onBuscarEnTodo && (
        <div className="mt-5">
          <button
            type="button"
            onClick={onBuscarEnTodo}
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-md px-5 h-10 text-sm font-bold transition"
          >
            Buscar "{termino}" en todo el catálogo →
          </button>
        </div>
      )}
    </div>
  );
}
