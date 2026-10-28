import repuestos from "./assets/repuestos.jpg";

/**
 * EncabezadoPagina
 * ==========================================
 * El encabezado de las páginas internas (catálogo, carrito, favoritos,
 * marcas y la cuenta): fondo negro con la foto del inicio muy oscurecida,
 * migas de pan, título y bajada. Sigue el estilo del hero del inicio.
 *
 * Props:
 *  - migas       camino hasta la página: cada paso es un texto o
 *                { texto, ir }; los que tienen `ir` son links. La última
 *                (la página actual) va en naranja.
 *  - titulo      (string)
 *  - descripcion (string)   opcional
 *  - inicio      (node)     opcional, a la izquierda del título (ej. avatar)
 *  - fin         (node)     opcional, a la derecha del título (ej. buscador);
 *                           en celular va debajo
 *  - children    (node)     opcional, debajo (ej. el aviso del vehículo)
 *  - ancho       (string)   ancho máximo, para alinear con el contenido
 */
export default function EncabezadoPagina({
  migas = [],
  titulo,
  descripcion,
  inicio,
  fin,
  children,
  ancho = "max-w-[1100px]",
}) {
  return (
    <section className="relative overflow-hidden bg-[#151719]">

      <img
        src={repuestos}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover object-bottom opacity-25"
      />
      <div className="absolute inset-0 bg-linear-to-r from-[#151719] via-[#151719]/85 to-[#151719]/40" />

      <div className="relative px-5 md:px-10 pt-[112px] pb-10">
      <div className={`${ancho} mx-auto`}>

        <p className="text-xs text-gray-400">
          {migas.map((miga, i) => {
            const { texto, ir } = typeof miga === "string" ? { texto: miga } : miga;
            const actual = i === migas.length - 1;
            return (
              <span key={texto}>
                {i > 0 && <span className="mx-1.5">›</span>}
                {ir && !actual ? (
                  <button
                    type="button"
                    onClick={ir}
                    className="hover:text-white hover:underline transition"
                  >
                    {texto}
                  </button>
                ) : (
                  <span className={actual ? "text-orange-400" : undefined}>{texto}</span>
                )}
              </span>
            );
          })}
        </p>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mt-3">
          <div className="flex items-center gap-4 min-w-0">
            {inicio}
            <div className="min-w-0">
              <h1 className="text-white text-3xl md:text-4xl font-black italic uppercase leading-none">
                {titulo}
              </h1>
              {descripcion && (
                <p className="text-gray-300 text-sm mt-2 truncate">{descripcion}</p>
              )}
            </div>
          </div>
          {fin && <div className="w-full lg:w-[420px] lg:shrink-0">{fin}</div>}
        </div>

        {children && <div className="mt-6">{children}</div>}

      </div>
      </div>

    </section>
  );
}
