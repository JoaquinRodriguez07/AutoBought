export default function ConfirmacionAgregarCarrito({
  producto,
  onDeshacer,
  onCerrar,
  onVerCarrito,
}) {
  if (!producto) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-5"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-producto-agregado"
        className="w-full max-w-[420px] rounded-xl bg-white p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="titulo-producto-agregado" className="text-lg font-black">
          Repuesto agregado al carrito.
        </h2>
        <p className="mt-2 text-[10px] text-gray-500">{producto.nombre}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={async () => {
              await onDeshacer(producto);
              onCerrar();
            }}
            className="flex-1 rounded-md border border-gray-200 py-3 text-[10px] font-black text-gray-600 hover:border-orange-500 hover:text-orange-500"
          >
            Deshacer
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="flex-1 rounded-md border border-gray-200 py-3 text-[10px] font-black text-gray-600 hover:border-orange-500 hover:text-orange-500"
          >
            Ok
          </button>
          <button
            type="button"
            onClick={onVerCarrito}
            className="flex-1 rounded-md bg-orange-500 py-3 text-[10px] font-black text-white hover:bg-orange-600"
          >
            Ver carrito
          </button>
        </div>
      </div>
    </div>
  );
}
