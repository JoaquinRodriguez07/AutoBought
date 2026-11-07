import { useState } from "react";
import { ArrowIcon } from "./Icons";

/**
 * FiltrosCatalogo
 * ==========================================
 * Barra lateral del catálogo. Solo muestra y avisa: los valores de los
 * filtros viven en Catalogo.jsx, que es el que filtra.
 *
 * Cada sección es un <details> que se puede plegar. Categoría y
 * Fabricante arrancan abiertas; el resto, cerradas salvo que ya tengan
 * algo elegido, así la barra es corta y baja junto con la página.
 * Las listas largas (fabricantes, marcas) muestran las primeras
 * VISIBLES opciones, las que más repuestos tienen, y un "Ver todos".
 */

const VISIBLE_COUNT = 6;

function Section({ titulo, abiertaAlInicio = true, children }) {
  const [abierta, setAbierta] = useState(abiertaAlInicio);

  return (
    <details
      open={abierta}
      onToggle={(e) => setAbierta(e.currentTarget.open)}
      className="group border-b border-gray-100 py-4"
    >
      <summary className="flex items-center justify-between cursor-pointer list-none text-xs font-black uppercase tracking-wide [&::-webkit-details-marker]:hidden">
        {titulo}
        <ArrowIcon className="w-4 h-4 text-gray-400 transition group-open:rotate-180" />
      </summary>

      <div className="mt-3">{children}</div>
    </details>
  );
}

function Counter({ cantidad }) {
  return (
    <span className="ml-auto text-xs text-gray-400 tabular-nums">
      {cantidad}
    </span>
  );
}

function CheckList({ opciones, seleccionados, onAlternar }) {
  const [verTodos, setVerTodos] = useState(false);

  // Las que más repuestos tienen primero; las tildadas siempre a la vista.
  const porCantidad = [...opciones].sort(
    ([a, ca], [b, cb]) => cb - ca || a.localeCompare(b, "es")
  );
  const visibles = verTodos
    ? porCantidad
    : porCantidad.filter(
        ([nombre], i) => i < VISIBLE_COUNT || seleccionados.includes(nombre)
      );

  return (
    <>
      {visibles.map(([nombre, cantidad]) => (
        <label
          key={nombre}
          className="flex items-center gap-2 py-1.5 cursor-pointer text-sm text-gray-700 hover:text-gray-900"
        >
          <input
            type="checkbox"
            className="w-4 h-4 accent-orange-500"
            checked={seleccionados.includes(nombre)}
            onChange={() => onAlternar(nombre)}
          />
          <span>{nombre}</span>
          <Counter cantidad={cantidad} />
        </label>
      ))}

      {porCantidad.length > VISIBLE_COUNT && (
        <button
          type="button"
          onClick={() => setVerTodos((v) => !v)}
          className="mt-2 text-xs font-bold text-orange-500 hover:underline"
        >
          {verTodos ? "Ver menos" : `Ver todos (${porCantidad.length})`}
        </button>
      )}
    </>
  );
}

export default function CatalogFilters({
  categorias,
  cargandoCategorias,
  errorCategorias,
  onReintentarCategorias,
  categoria,
  onCategoria,
  opcionesFabricante,
  fabricantes,
  onAlternarFabricante,
  opcionesMarca,
  marcasAuto,
  onAlternarMarca,
  precioMin,
  precioMax,
  onPrecioMin,
  onPrecioMax,
  soloConStock,
  onSoloConStock,
}) {
  return (
    <div>
      {/* CATEGORÍAS */}
      {/* 100% data-driven: nombres y cantidades de
          GET /api/v1/parts/categories, sin lista fija. */}

      <Section titulo="Categoría">
        {cargandoCategorias && (
          <p className="py-2 text-xs text-gray-400">Cargando categorías…</p>
        )}

        <div className="space-y-0.5">
          {categorias.map((item) => (
            <button
              key={item.nombre}
              type="button"
              onClick={() => onCategoria(item.nombre)}
              aria-pressed={categoria === item.nombre}
              className={`w-[calc(100%+1.5rem)] -mx-3 flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition ${
                categoria === item.nombre
                  ? "bg-orange-50 text-orange-600 font-bold"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span>{item.nombre}</span>
              <Counter cantidad={item.cantidad} />
            </button>
          ))}
        </div>

        {!cargandoCategorias && errorCategorias && (
          <div className="py-2">
            <p className="text-xs text-gray-400">{errorCategorias}</p>
            <button
              type="button"
              onClick={onReintentarCategorias}
              className="text-xs font-bold text-orange-500 underline mt-1"
            >
              Reintentar
            </button>
          </div>
        )}
      </Section>

      {/* FABRICANTES */}
      {/* Salen de los repuestos cargados (categoría y vehículo ya
          aplicados): solo aparecen los que tienen algo para mostrar. */}

      {opcionesFabricante.length > 0 && (
        <Section titulo="Fabricante">
          <CheckList
            opciones={opcionesFabricante}
            seleccionados={fabricantes}
            onAlternar={onAlternarFabricante}
          />
        </Section>
      )}

      {/* PRECIO */}

      <Section titulo="Precio" abiertaAlInicio={precioMin !== "" || precioMax !== ""}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            inputMode="numeric"
            aria-label="Precio mínimo"
            placeholder="Mín"
            value={precioMin}
            onChange={(e) => onPrecioMin(e.target.value)}
            className="w-full min-w-0 border border-gray-200 rounded-md px-3 py-2 text-sm outline-hidden focus:border-orange-500"
          />
          <span className="text-gray-400">–</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            aria-label="Precio máximo"
            placeholder="Máx"
            value={precioMax}
            onChange={(e) => onPrecioMax(e.target.value)}
            className="w-full min-w-0 border border-gray-200 rounded-md px-3 py-2 text-sm outline-hidden focus:border-orange-500"
          />
        </div>
      </Section>

      {/* DISPONIBILIDAD */}

      <Section titulo="Disponibilidad" abiertaAlInicio={soloConStock}>
        <label className="flex items-center gap-2 py-1.5 cursor-pointer text-sm text-gray-700">
          <input
            type="checkbox"
            className="w-4 h-4 accent-orange-500"
            checked={soloConStock}
            onChange={(e) => onSoloConStock(e.target.checked)}
          />
          Solo con stock
        </label>
      </Section>

      {/* MARCA DEL AUTO */}
      {/* Las marcas compatibles de lo cargado. Con un vehículo activo
          todo es de esa marca, así que no se muestra. */}

      {opcionesMarca.length > 1 && (
        <Section titulo="Marca del auto" abiertaAlInicio={marcasAuto.length > 0}>
          <CheckList
            opciones={opcionesMarca}
            seleccionados={marcasAuto}
            onAlternar={onAlternarMarca}
          />
        </Section>
      )}
    </div>
  );
}
