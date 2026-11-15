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

function Section({ title, openToHome = true, children }) {
  const [isShown, setIsShown] = useState(openToHome);

  return (
    <details
      open={isShown}
      onToggle={(e) => setIsShown(e.currentTarget.open)}
      className="group border-b border-gray-100 py-4"
    >
      <summary className="flex items-center justify-between cursor-pointer list-none text-xs font-black uppercase tracking-wide [&::-webkit-details-marker]:hidden">
        {title}
        <ArrowIcon className="w-4 h-4 text-gray-400 transition group-open:rotate-180" />
      </summary>

      <div className="mt-3">{children}</div>
    </details>
  );
}

function Counter({ quantity }) {
  return (
    <span className="ml-auto text-xs text-gray-400 tabular-nums">
      {quantity}
    </span>
  );
}

function CheckList({ opciones, selected, onToggle }) {
  const [seeAll, setSeeAll] = useState(false);

  // Las que más repuestos tienen primero; las tildadas siempre a la vista.
  const byQuantity = [...opciones].sort(
    ([a, ca], [b, cb]) => cb - ca || a.localeCompare(b, "es")
  );
  const visible = seeAll
    ? byQuantity
    : byQuantity.filter(
        ([displayName], i) => i < VISIBLE_COUNT || selected.includes(displayName)
      );

  return (
    <>
      {visible.map(([displayName, quantity]) => (
        <label
          key={displayName}
          className="flex items-center gap-2 py-1.5 cursor-pointer text-sm text-gray-700 hover:text-gray-900"
        >
          <input
            type="checkbox"
            className="w-4 h-4 accent-orange-500"
            checked={selected.includes(displayName)}
            onChange={() => onToggle(displayName)}
          />
          <span>{displayName}</span>
          <Counter quantity={quantity} />
        </label>
      ))}

      {byQuantity.length > VISIBLE_COUNT && (
        <button
          type="button"
          onClick={() => setSeeAll((v) => !v)}
          className="mt-2 text-xs font-bold text-orange-500 hover:underline"
        >
          {seeAll ? "Ver menos" : `Ver todos (${byQuantity.length})`}
        </button>
      )}
    </>
  );
}

export default function CatalogFilters({
  categories,
  loadingCategories,
  categoriesError,
  onRetryCategories,
  categoria,
  onCategory,
  manufacturerOptions,
  manufacturers,
  onToggleManufacturer,
  brandOptions,
  brandsCar,
  onToggleBrand,
  priceMin,
  priceMax,
  onPriceMin,
  onPriceMax,
  onlyWithStock,
  onOnlyWithStock,
}) {
  return (
    <div>
      {/* CATEGORÍAS */}
      {/* 100% data-driven: nombres y cantidades de
          GET /api/v1/parts/categories, sin lista fija. */}

      <Section title="Categoría">
        {loadingCategories && (
          <p className="py-2 text-xs text-gray-400">Cargando categorías…</p>
        )}

        <div className="space-y-0.5">
          {categories.map((item) => (
            <button
              key={item.displayName}
              type="button"
              onClick={() => onCategory(item.displayName)}
              aria-pressed={categoria === item.displayName}
              className={`w-[calc(100%+1.5rem)] -mx-3 flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition ${
                categoria === item.displayName
                  ? "bg-orange-50 text-orange-600 font-bold"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span>{item.displayName}</span>
              <Counter quantity={item.quantity} />
            </button>
          ))}
        </div>

        {!loadingCategories && categoriesError && (
          <div className="py-2">
            <p className="text-xs text-gray-400">{categoriesError}</p>
            <button
              type="button"
              onClick={onRetryCategories}
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

      {manufacturerOptions.length > 0 && (
        <Section title="Fabricante">
          <CheckList
            opciones={manufacturerOptions}
            selected={manufacturers}
            onToggle={onToggleManufacturer}
          />
        </Section>
      )}

      {/* PRECIO */}

      <Section title="Precio" openToHome={priceMin !== "" || priceMax !== ""}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            inputMode="numeric"
            aria-label="Precio mínimo"
            placeholder="Mín"
            value={priceMin}
            onChange={(e) => onPriceMin(e.target.value)}
            className="w-full min-w-0 border border-gray-200 rounded-md px-3 py-2 text-sm outline-hidden focus:border-orange-500"
          />
          <span className="text-gray-400">–</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            aria-label="Precio máximo"
            placeholder="Máx"
            value={priceMax}
            onChange={(e) => onPriceMax(e.target.value)}
            className="w-full min-w-0 border border-gray-200 rounded-md px-3 py-2 text-sm outline-hidden focus:border-orange-500"
          />
        </div>
      </Section>

      {/* DISPONIBILIDAD */}

      <Section title="Disponibilidad" openToHome={onlyWithStock}>
        <label className="flex items-center gap-2 py-1.5 cursor-pointer text-sm text-gray-700">
          <input
            type="checkbox"
            className="w-4 h-4 accent-orange-500"
            checked={onlyWithStock}
            onChange={(e) => onOnlyWithStock(e.target.checked)}
          />
          Solo con stock
        </label>
      </Section>

      {/* MARCA DEL AUTO */}
      {/* Las marcas compatibles de lo cargado. Con un vehículo activo
          todo es de esa marca, así que no se muestra. */}

      {brandOptions.length > 1 && (
        <Section title="Marca del auto" openToHome={brandsCar.length > 0}>
          <CheckList
            opciones={brandOptions}
            selected={brandsCar}
            onToggle={onToggleBrand}
          />
        </Section>
      )}
    </div>
  );
}
