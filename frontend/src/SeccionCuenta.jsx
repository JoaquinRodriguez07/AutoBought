/**
 * SeccionCuenta
 * ==========================================
 * Una tarjeta de "Información personal" (datos, contraseña, mails): título,
 * una línea de ayuda, un botón opcional a la derecha (ej. "Editar") y,
 * debajo de una línea, el contenido. Sin contenido, la tarjeta es solo el
 * encabezado.
 */
export default function SeccionCuenta({ titulo, descripcion, accion, idTitulo, children }) {
  return (
    <section aria-labelledby={idTitulo} className="border border-gray-200 rounded-xl bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
        <div className="min-w-0">
          <h3 id={idTitulo} className="text-base font-black text-gray-900">
            {titulo}
          </h3>
          {descripcion && <p className="text-sm text-gray-500 mt-1">{descripcion}</p>}
        </div>
        {accion}
      </div>

      {children && <div className="border-t border-gray-100 px-6 py-5">{children}</div>}
    </section>
  );
}

// El botón de una sección (Editar, Cambiar contraseña): secundario, para
// que el naranja quede para la acción principal (Guardar).
export const claseBotonSeccion =
  "h-9 px-4 shrink-0 bg-white border border-gray-300 text-gray-800 hover:border-orange-500 hover:text-orange-600 rounded-md text-xs font-black transition";

// Los botones de un formulario dentro de una sección.
export const claseBotonCancelar =
  "h-10 px-5 bg-white border border-gray-300 text-gray-700 hover:border-gray-400 rounded-md text-xs font-black transition";
export const claseBotonGuardar =
  "h-10 px-5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-md text-xs font-black transition";
