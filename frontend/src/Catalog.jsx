// Pantalla del catálogo: filtros, búsqueda, tarjetas de repuestos y favoritos.

import { useEffect, useMemo, useState } from "react";
import { useGenericImage } from "./mapPart";
import { useLocation, useSearchParams } from "react-router-dom";
import StockAlertButton from "./StockAlertButton";
import Navbar from "./Navbar";
import AddToCartButton from "./AddToCartButton";
import AssistantInvite from "./AssistantInvite";
import SearchBar, { CATALOG_SEARCH_ID } from "./SearchBar";
import ActiveVehicleBanner from "./ActiveVehicleBanner";
import PageHeader from "./PageHeader";
import CatalogFilters from "./CatalogFilters";
import { CartIcon, CloseIcon, HeartIcon, FiltersIcon } from "./Icons";
import { filterParts } from "./filterParts";
import NoSearchResults from "./NoSearchResults";
import { searchText, getCategories, getParts } from "./api";
import { useVehicle } from "./context/VehicleContext";
import { isSeller } from "./auth";

// Cuántas tarjetas se muestran de entrada, y cuántas más con "Ver más".
const PARTS_PER_BATCH = 24;

// ==========================================
// AYUDAS DE LOS FILTROS
// ==========================================

// Cuántos repuestos hay de cada opción ([nombre, cantidad]). `valores`
// devuelve las opciones de un repuesto (un fabricante, varias marcas).
function countOptions(products, values, selected) {
  const quantities = new Map(selected.map((s) => [s, 0]));
  for (const p of products) {
    for (const rawValue of values(p)) {
      quantities.set(rawValue, (quantities.get(rawValue) ?? 0) + 1);
    }
  }
  return [...quantities];
}

// Para los setState de listas: saca un valor, o lo pone si no está.
const without = (rawValue) => (list) => list.filter((v) => v !== rawValue);
const toggle = (rawValue) => (list) =>
  list.includes(rawValue) ? list.filter((v) => v !== rawValue) : [...list, rawValue];

const pesos = (rawValue) => `$${Number(rawValue).toLocaleString("es-UY")}`;

function priceText(min, max) {
  if (min !== "" && max !== "") return `${pesos(min)} – ${pesos(max)}`;
  return min !== "" ? `Desde ${pesos(min)}` : `Hasta ${pesos(max)}`;
}

// "Para Chevrolet Onix, Prisma" si es de una sola marca y pocos modelos;
// si es de muchas, solo las marcas, o "Para varias marcas".
function compatibilityText({ brands = [], models = [] }) {
  if (brands.length === 0) return "";
  if (brands.length === 1 && models.length > 0 && models.length <= 3) {
    return `Para ${brands[0]} ${models.join(", ")}`;
  }
  if (brands.length <= 3) return `Para ${brands.join(", ")}`;
  return "Para varias marcas";
}

export default function Catalog({
  // ==========================================
  // NAVBAR
  // ==========================================
  sessionUser,
  onHome,
  onCatalogo,
  onLogin,
  onBrands,
  onCart,
  onFavorites,

  // MENÚ DE USUARIO
  onProfile,
  onAddresses,
  onHistory,
  onCloseSession,

  // CONTADORES
  favoritesQuantity,

  // ==========================================
  // CATÁLOGO
  // ==========================================
  onDetail,
  initialCategory,
  onSelectedCategory,
  onToggleFavorite,
  isFavorite,
  onToggleNoticeStock,
  hasNoticeStock = () => false,
}) {
  // Vehículo Activo (el que se confirmó con "Buscar Repuestos"). Vive en
  // VehicleContext, así que sobrevive a ir al carrito y volver.
  const { activeVehicle, clearVehicle, activateVehicle } = useVehicle();

  // `categoria` en null significa "todas las categorías": es lo que
  // deja el botón "Limpiar filtros" y lo que se traduce en un
  // GET /api/v1/parts sin parámetros.
  //
  // El nombre de la categoría NO se inventa acá: se usa tal cual lo
  // manda quien navega (App.jsx / Home.jsx) o el que devuelve
  // GET /api/v1/parts/categories. Esta pantalla no tiene literales de
  // categoría ni traducciones propias.
  const [categoria, setCategory] = useState(
    initialCategory || null
  );

  const [sort, setSort] = useState("Más relevantes");
  const [searchParams, setSearchParams] = useSearchParams();
  const queryState = (searchParams.get("q") || "").trim();
  const { key: keyNavigation } = useLocation();
  // Si se entra con ?q= (desde la barra del menú), la búsqueda se ve en
  // la barra del catálogo.
  const [search, setSearch] = useState(queryState);
  const [manufacturers, setManufacturers] = useState(() => {
    const fromHome = searchParams.get("fabricante");
    return fromHome ? [fromHome] : [];
  });
  const [brandsCar, setBrandsCar] = useState(() => {
    const fromHome = searchParams.get("marca");
    return fromHome ? [fromHome] : [];
  });

  // Los filtros ?marca= y ?fabricante= (marcas del footer, logos de Home,
  // botones de fabricantes) también se aplican cuando YA se está en el
  // catálogo: ahí la pantalla no se vuelve a montar y el estado inicial
  // de arriba no se lee de nuevo. Se mira la navegación (no solo la
  // dirección) para que tocar de nuevo la misma marca, después de haber
  // destildado el filtro, lo vuelva a aplicar. Sin esos parámetros no se
  // toca nada: lo que el cliente tildó a mano se conserva.
  useEffect(() => {
    const marca = searchParams.get("marca");
    const fabricante = searchParams.get("fabricante");
    if (!marca && !fabricante) return;

    if (marca) setBrandsCar([marca]);
    if (fabricante) setManufacturers([fabricante]);
    // Un filtro de una sola vez parte de la lista completa: se quita el
    // texto que se había escrito en la barra, que si no seguiría filtrando.
    setSearch(queryState);
    // Solo cuando se navega: los filtros que el cliente cambia después
    // a mano no se pisan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyNavigation]);

  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [onlyWithStock, setOnlyWithStock] = useState(false);
  // En celular los filtros se esconden detrás de un botón.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quantities, setQuantities] = useState({});
  // El vendedor no compra: no ve carrito, favoritos ni avisos de stock.
  const seller = isSeller(sessionUser);


  // ==========================================
  // DATOS DE LA API
  // ==========================================
  // El catálogo ya no usa el mock local de repuestos: los repuestos y las
  // categorías vienen del backend. Si el fetch falla se muestra el
  // estado de error (no hay fallback al mock, a propósito).

  // Cada respuesta se guarda junto con la `clave` del pedido que la
  // originó (categoría + vehículo + reintento). Así "cargando" se
  // DERIVA en el render comparando claves, en vez de setearse
  // sincrónicamente dentro del efecto, y una respuesta vieja nunca
  // pisa a una nueva.

  const [retry, setRetry] = useState(0);
  const vehicleKey = `${activeVehicle?.brand ?? ""}|${
    activeVehicle?.model ?? ""
  }|${activeVehicle?.year ?? ""}`;
  const orderKey = `${retry}|${categoria ?? ""}|${vehicleKey}`;

  const [response, setResponse] = useState({
    key: null,
    products: [],
    error: "",
  });

  const loading = queryState
    ? response.key !== `libre|${queryState}`
    : response.key !== orderKey;
  const products = response.products;
  const error = response.error;

  const [retryCategories, setRetryCategories] = useState(0);

  const categoriesKey = String(retryCategories);

  const [categoriesResponse, setCategoriesResponse] = useState({
    key: null,
    categories: [],
    error: "",
  });

  const loadingCategories =
    categoriesResponse.key !== categoriesKey;
  const categories = categoriesResponse.categories;
  const categoriesError = categoriesResponse.error;

  // ==========================================
  // ACTUALIZAR CATEGORÍA
  // ==========================================
  // Se entra al catálogo desde Home ya filtrado por una categoría
  // (App.jsx pasa `categoriaCatalogo`); ese camino se mantiene.

  useEffect(() => {
    setCategory(initialCategory || null);
  }, [initialCategory]);

  // ==========================================
  // BÚSQUEDA LIBRE
  // ==========================================
  useEffect(() => {
  if (!queryState) return;

  let active = true;

  searchText(queryState)
    .then(({ parts, entities }) => {
      if (!active) return;

      const hasEntities =
        entities &&
        (entities.part ||
          entities.brand ||
          entities.model ||
          entities.year ||
          entities.fuel);

      if (!hasEntities) {
        setResponse({
          key: `libre|${queryState}`,
          products: [],
          error:
            "No pudimos entender tu búsqueda, por favor usa el filtro de compatibilidad manual",
        });
        return;
      }

      if (entities.brand) {
        activateVehicle({
          brand: entities.brand,
          model: entities.model || "",
          year: entities.year || "",
        });
      }

      setResponse({
        key: `libre|${queryState}`,
        products: parts,
        error: "",
      });
    })
    .catch((e) => {
      if (!active) return;

      setResponse({
        key: `libre|${queryState}`,
        products: [],
        error: e.message || "No pudimos realizar la búsqueda.",
      });
    });

  return () => {
    active = false;
  };
}, [queryState, activateVehicle]);

  // ==========================================
  // CARGAR REPUESTOS
  // ==========================================
  // Categoría y vehículo (marca, modelo, año) son filtros del servidor y
  // se ACUMULAN en un mismo pedido, ej:
  // GET /api/v1/parts?categoria=Frenos&brand=Ford&model=Fiesta&year=2018
  // El vehículo solo cambia al confirmarlo con "Buscar Repuestos" (no al
  // mover un dropdown). `activo` descarta respuestas viejas si el
  // usuario cambia de filtro antes de que llegue la anterior.

  useEffect(() => {
    let active = true;
    if (queryState) return;

    getParts({
      categoria: categoria || undefined,
      brand: activeVehicle?.brand || undefined,
      model: activeVehicle?.model || undefined,
      year: activeVehicle?.year || undefined,
    })
      .then((list) => {
        if (!active) return;
        setResponse({
          key: orderKey,
          products: list,
          error: "",
        });
      })
      .catch((e) => {
        if (!active) return;
        setResponse({
          key: orderKey,
          products: [],
          error: e.message || "No pudimos cargar los repuestos.",
        });
      });

    return () => {
      active = false;
    };
  }, [categoria, activeVehicle, orderKey, queryState]);

  // ==========================================
  // CARGAR CATEGORÍAS
  // ==========================================
  // El sidebar es 100% data-driven: los nombres y las cantidades son
  // los que devuelve GET /api/v1/parts/categories, sin lista fija ni
  // traducciones en el frontend.

  useEffect(() => {
    let active = true;

    getCategories()
      .then((list) => {
        if (!active) return;
        setCategoriesResponse({
          key: categoriesKey,
          categories: list,
          error: "",
        });
      })
      .catch((e) => {
        if (!active) return;
        setCategoriesResponse({
          key: categoriesKey,
          categories: [],
          error:
            e.message || "No pudimos cargar las categorías.",
        });
      });

    return () => {
      active = false;
    };
  }, [categoriesKey]);

  // ==========================================
  // PRODUCTOS MOSTRADOS
  // ==========================================
  // Categoría y vehículo ya vienen filtrados por el backend. La búsqueda
  // por texto (nombre, código, fabricante, marcas compatibles y
  // categoría), los filtros del sidebar (fabricante, precio, stock,
  // marca del auto) y el orden se resuelven en el navegador con
  // filtrarRepuestos, en vivo.

  const shownProducts = useMemo(
    () =>
      filterParts(products, {
        // Lo que se buscó con Enter ya lo resolvió el servidor: no se
        // vuelve a filtrar por ese mismo texto.
        search: search.trim() === queryState ? "" : search,
        manufacturers,
        brandsCar,
        priceMin,
        priceMax,
        onlyWithStock,
        sort,
      }),
    [products, search, queryState, manufacturers, brandsCar, priceMin, priceMax, onlyWithStock, sort]
  );

  // Se muestran de a REPUESTOS_POR_TANDA: con el catálogo completo son
  // miles de tarjetas y la página se pone lenta. "Ver más" suma otra
  // tanda. La cantidad se guarda junto con la lista a la que corresponde:
  // si cambian los filtros (otra lista), vuelve a la primera tanda.
  const [batch, setBatch] = useState({ list: null, quantity: PARTS_PER_BATCH });
  const visibleQuantity = batch.list === shownProducts ? batch.quantity : PARTS_PER_BATCH;
  const visibleProducts = shownProducts.slice(0, visibleQuantity);
  const seeMore = () =>
    setBatch({ list: shownProducts, quantity: visibleQuantity + PARTS_PER_BATCH });

  // Las opciones de fabricante y marca del auto salen de los repuestos
  // cargados (con la categoría y el vehículo ya aplicados), con cuántos
  // hay de cada una. Las tildadas se muestran aunque ya no tengan
  // repuestos, para poder destildarlas.
  const manufacturerOptions = useMemo(
    () => countOptions(products, (p) => (p.fabricante ? [p.fabricante] : []), manufacturers),
    [products, manufacturers]
  );
  const brandOptions = useMemo(
    () => countOptions(products, (p) => p.brands ?? [], brandsCar),
    [products, brandsCar]
  );

  // ==========================================
  // LIMPIAR FILTROS
  // ==========================================
  // Sin categoría, el efecto de arriba vuelve a pedir GET /api/v1/parts
  // sin ese parámetro (el vehículo, si hay uno activo, se mantiene:
  // "Limpiar filtros" es de todo lo demás; el vehículo se quita desde el
  // banner).

  // La categoría vive en dos lados: acá y en App (`categoriaCatalogo`,
  // que es lo que vuelve como `categoriaInicial` al entrar de nuevo al
  // catálogo). Se cambian siempre juntas: si solo se limpiara la de
  // acá, volver con el botón Atrás reaplicaría el filtro viejo.
  const changeCategory = (newPassword) => {
    if (queryState) {
      setSearchParams({});
      setSearch("");
    }

    setCategory(newPassword);
    onSelectedCategory?.(newPassword);
  };

  const clearFilters = () => {
    if (queryState) {
      setSearchParams({});
    }

    changeCategory(null);
    setSearch("");
    setManufacturers([]);
    setBrandsCar([]);
    setPriceMin("");
    setPriceMax("");
    setOnlyWithStock(false);
  };

  // Los filtros activos, como chips arriba de los resultados: cada uno
  // con lo que hay que hacer para quitarlo.
  const filtersActivos = [
    categoria && { key: "categoria", texto: categoria, remove: () => changeCategory(null) },
    search.trim() && { key: "search", texto: `"${search.trim()}"`, remove: () => runSearch("") },
    ...manufacturers.map((f) => ({ key: `fabricante-${f}`, texto: f, remove: () => setManufacturers(without(f)) })),
    ...brandsCar.map((m) => ({ key: `marca-${m}`, texto: `Para ${m}`, remove: () => setBrandsCar(without(m)) })),
    (priceMin !== "" || priceMax !== "") && {
      key: "price",
      texto: priceText(priceMin, priceMax),
      remove: () => {
        setPriceMin("");
        setPriceMax("");
      },
    },
    onlyWithStock && { key: "stock", texto: "Con stock", remove: () => setOnlyWithStock(false) },
  ].filter(Boolean);

  const hasFilters = filtersActivos.length > 0;

  // ==========================================
  // BUSCAR
  // ==========================================
  // Una sola barra: mientras se escribe filtra en vivo lo cargado
  // (filtrarRepuestos); con Enter o la lupa hace la búsqueda del servidor
  // (?q=), que entiende "pastillas onix 2020", errores y sinónimos.
  const runSearch = (texto) => {
    const cleaned = texto.trim();
    setSearch(cleaned);
    setSearchParams(cleaned ? { q: cleaned } : {});
  };

  // Lo escrito que todavía no se buscó en el servidor: para eso se ofrece
  // el botón "Buscar ... en todo el catálogo" (así no hace falta saber
  // que existe el Enter).
  const textWithoutSearch = search.trim() !== queryState ? search.trim() : "";

  // "Borrar filtros" del banner: quita el vehículo activo Y el resto de
  // los filtros, para que el catálogo vuelva a la lista completa.
  const clearVehicleAndFilters = () => {
    clearVehicle();
    clearFilters();
  };

  // ==========================================
  // CAMBIAR CANTIDAD
  // ==========================================
  // No deja pedir más de lo que hay en stock.

  const changeQuantity = (product, cambio) => {
    setQuantities((current) => {
      const currentQty = current[product.id] || 1;
      const newPassword = Math.min(
        product.stock,
        Math.max(1, currentQty + cambio)
      );
      return { ...current, [product.id]: newPassword };
    });
  };

  // ==========================================
  // AGREGAR AL CARRITO
  // ==========================================

  // El botón (BotonAgregarCarrito) llama a addToCart y CartContext
  // muestra el aviso; acá solo se vuelve el selector de cantidad a 1.
  const resetQuantity = (product) => {
    setQuantities((current) => ({
      ...current,
      [product.id]: 1,
    }));
  };

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      {/* =================================================
          NAVBAR
      ================================================== */}

      <Navbar
        currentPage="catalogo"

        sessionUser={sessionUser}

        onHome={onHome}
        onCatalogo={onCatalogo}
        onLogin={onLogin}
        onBrands={onBrands}
        onCart={onCart}
        onFavorites={onFavorites}

        // MENÚ DE USUARIO
        onProfile={onProfile}
        onAddresses={onAddresses}
        onHistory={onHistory}
        onCloseSession={onCloseSession}

        favoritesQuantity={favoritesQuantity}
      />

      {/* =================================================
          CONTENIDO
      ================================================== */}

      <main>

        {/* =================================================
            ENCABEZADO
        ================================================== */}

        <PageHeader
          ancho="max-w-[1200px]"
          migas={[
            { texto: "Inicio", goTo: onHome },
            { texto: "Repuestos", goTo: () => changeCategory(null) },
            categoria || "Todos",
          ]}
          title={categoria || "Todos los repuestos"}
          description="Encontrá el repuesto justo para tu auto."
        >

          {/* BUSCADOR, a lo ancho. Pit ya está en la barra y en su botón
              flotante: acá no se repite (sí aparece si una búsqueda no
              encuentra nada). */}

          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 min-w-0">
              {/* La lupa de la barra, en esta página, enfoca este buscador
                  (ver Navbar). */}
              <SearchBar
                inputId={CATALOG_SEARCH_ID}
                value={search}
                onChange={setSearch}
                onSubmit={runSearch}
                placeholder="Buscar repuesto por nombre, código o fabricante..."
                className="h-14"
              />

              {textWithoutSearch && (
                <button
                  type="button"
                  onClick={() => runSearch(textWithoutSearch)}
                  className="mt-2 text-sm text-gray-300 hover:text-orange-400 transition"
                >
                  Buscar <span className="font-bold text-white">"{textWithoutSearch}"</span> en todo el catálogo →
                </button>
              )}
            </div>
          </div>

          {/* VEHÍCULO ACTIVO */}
          {/* Oculto si no hay vehículo activo en VehicleContext. */}

          {activeVehicle && (
            <div className="mt-4">
              <ActiveVehicleBanner
                onClear={clearVehicleAndFilters}
              />
            </div>
          )}

        </PageHeader>

        {/* =================================================
            CATÁLOGO
        ================================================== */}

        <section className="px-5 md:px-10 py-8">

          <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-8">

            {/* =================================================
                SIDEBAR
            ================================================== */}

            <aside
              aria-label="Filtros"
              // -mx-3 px-3: los botones de categoría se estiran 12 px a cada
              // lado para el resaltado; así entran en la columna con scroll y
              // no queda nada para arrastrar hacia los costados.
              className={`${filtersOpen ? "block" : "hidden"} self-start lg:sticky lg:top-24 lg:block lg:-mx-3 lg:px-3 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-contain`}
            >

              <CatalogFilters
                categories={categories}
                loadingCategories={loadingCategories}
                categoriesError={categoriesError}
                onRetryCategories={() => setRetryCategories((v) => v + 1)}
                categoria={categoria}
                onCategory={changeCategory}
                manufacturerOptions={manufacturerOptions}
                manufacturers={manufacturers}
                onToggleManufacturer={(f) => setManufacturers(toggle(f))}
                brandOptions={brandOptions}
                brandsCar={brandsCar}
                onToggleBrand={(m) => setBrandsCar(toggle(m))}
                priceMin={priceMin}
                priceMax={priceMax}
                onPriceMin={setPriceMin}
                onPriceMax={setPriceMax}
                onlyWithStock={onlyWithStock}
                onOnlyWithStock={setOnlyWithStock}
              />

            </aside>

            {/* =================================================
                PRODUCTOS
            ================================================== */}

            <div className="min-w-0">

              {/* RESULTADOS + ORDEN */}

              <div className="flex flex-wrap items-center gap-3 mb-4">

                <p className="text-sm font-bold mr-auto">

                  {loading ? (

                    "Cargando repuestos…"

                  ) : (
                    <>

                      <span className="text-orange-500">
                        {shownProducts.length}
                      </span>{" "}

                      {shownProducts.length === 1 ? "resultado" : "resultados"}

                    </>
                  )}

                </p>

                <button
                  type="button"
                  onClick={() => setFiltersOpen((v) => !v)}
                  aria-expanded={filtersOpen}
                  className="lg:hidden flex items-center gap-2 border border-gray-200 rounded-md px-3 h-9 text-sm font-bold"
                >
                  <FiltersIcon />
                  {filtersOpen ? "Ocultar filtros" : "Filtros"}
                  {filtersActivos.length > 0 && (
                    <span className="bg-orange-500 text-white rounded-full px-1.5 text-xs">
                      {filtersActivos.length}
                    </span>
                  )}
                </button>

                <label className="flex items-center gap-2 text-sm text-gray-500">
                  Ordenar por
                  <select
                    value={sort}
                    onChange={(e) =>
                      setSort(e.target.value)
                    }
                    className="border border-gray-200 rounded-md px-3 h-9 text-sm text-gray-900 outline-hidden focus:border-orange-500"
                  >
                    <option>Más relevantes</option>
                    <option>Menor precio</option>
                    <option>Mayor precio</option>
                    <option>Nombre A-Z</option>
                  </select>
                </label>

              </div>

              {/* FILTROS ACTIVOS */}

              {hasFilters && (

                <div className="flex flex-wrap items-center gap-2 mb-5">

                  {filtersActivos.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={filter.remove}
                      aria-label={`Quitar filtro ${filter.texto}`}
                      className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 rounded-full pl-3 pr-2 h-8 text-xs font-semibold transition"
                    >
                      {filter.texto}
                      <CloseIcon className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-xs font-bold text-orange-500 hover:underline ml-1"
                  >
                    Limpiar filtros
                  </button>

                </div>

              )}

              {/* CARGANDO */}

              {loading && (
                <div className="py-20 text-center text-gray-400 text-sm">
                  Cargando repuestos…
                </div>
              )}

              {/* ERROR */}
              {/* Si la API falla no se muestran datos de mentira: se
                  avisa del error y se ofrece reintentar. */}

              {!loading && error && (

                <div className="py-20 text-center">

                  <p className="text-sm text-gray-500">
                    {error}
                  </p>

                  <button
                    type="button"
                    onClick={() => setRetry((v) => v + 1)}
                    className="mt-4 px-4 h-9 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white rounded-md text-sm font-bold transition"
                  >
                    Reintentar
                  </button>

                </div>

              )}

              {/* GRID */}
              {/* Se oculta por completo cuando no hay resultados: la
                  retroalimentación la muestra SinResultadosBusqueda
                  (o el mensaje genérico) más abajo. */}

              {!loading && !error && shownProducts.length > 0 && (

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">

                {visibleProducts.map((product) => {

                  const quantity =
                    quantities[product.id] || 1;

                  const favorite =
                    isFavorite(product.id);

                  const withoutStock = product.stock === 0;

                  const compatibilidad = compatibilityText(product);

                  return (

                    // Toda la tarjeta lleva al detalle: el nombre es el botón
                    // y su ::after la cubre entera. Favorito, cantidad y
                    // "Agregar" quedan por encima (relative z-10).
                    <article
                      key={product.id}
                      className="group relative flex flex-col bg-white border border-gray-100 rounded-xl overflow-hidden shadow-xs hover:shadow-lg hover:border-gray-200 transition"
                    >

                      {/* IMAGEN */}

                      <div className="relative h-[180px] bg-white">

                        {/* Sin filtro, el catálogo completo son más de
                            mil tarjetas: lazy evita decodificar todas
                            las imágenes que están fuera de pantalla. */}

                        <img onError={useGenericImage}
                          src={product.image}
                          alt={product.displayName}
                          loading="lazy"
                          className="w-full h-full object-contain p-3 group-hover:scale-105 transition duration-300"
                        />

                        {!seller && (
                        <button
                          type="button"
                          onClick={() =>
                            onToggleFavorite(product)
                          }
                          aria-label={favorite ? "Quitar de favoritos" : "Marcar como favorito"}
                          aria-pressed={favorite}
                          className={`absolute z-10 top-3 right-3 w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center transition hover:scale-105 ${
                            favorite
                              ? "text-orange-500"
                              : "text-gray-500"
                          }`}
                        >
                          <HeartIcon full={favorite} className="w-5 h-5" />
                        </button>
                        )}

                      </div>

                      {/* INFORMACIÓN */}

                      <div className="flex flex-col flex-1 p-4">

                        <p className="text-xs font-black uppercase tracking-wide text-orange-500">
                          {product.fabricante}
                        </p>

                        <h3 className="text-sm font-bold mt-1 leading-snug">
                          <button
                            type="button"
                            onClick={() => onDetail(product)}
                            aria-label={`Ver detalle de ${product.displayName}`}
                            className="text-left group-hover:text-orange-500 transition after:absolute after:inset-0 after:content-['']"
                          >
                            {product.displayName}
                          </button>
                        </h3>

                        {compatibilidad && (
                          <p className="text-xs text-gray-500 mt-1">
                            {compatibilidad}
                          </p>
                        )}

                        <p className="text-xs text-gray-400 mt-1">
                          Código: {product.code}
                        </p>

                        <div className="mt-auto pt-4 flex items-end justify-between gap-2">

                          <p className="text-xl font-black">
                            {pesos(product.price)}
                          </p>

                          {withoutStock ? (
                            <p className="text-xs text-red-500 font-bold">
                              Sin stock
                            </p>
                          ) : (
                            <p className="text-xs text-green-600 font-bold">
                              {product.stock} en stock
                            </p>
                          )}

                        </div>

                        {withoutStock && !seller && (
                          <StockAlertButton
                            product={product}
                            hasNotice={hasNoticeStock(product.partId)}
                            onToggleNotice={onToggleNoticeStock}
                            className="relative z-10 mt-2 self-start"
                          />
                        )}

                        {/* CANTIDAD + AGREGAR */}

                        {!seller && (
                        <div className="relative z-10 flex items-center gap-2 mt-4">

                          <div className="flex border border-gray-200 rounded-md">

                            <button
                              type="button"
                              onClick={() =>
                                changeQuantity(
                                  product,
                                  -1
                                )
                              }
                              disabled={withoutStock}
                              className="w-8 h-9 disabled:opacity-40"
                            >
                              −
                            </button>

                            <span className="w-8 flex items-center justify-center text-sm">
                              {withoutStock ? 0 : quantity}
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                changeQuantity(
                                  product,
                                  1
                                )
                              }
                              disabled={
                                withoutStock ||
                                quantity >= product.stock
                              }
                              className="w-8 h-9 disabled:opacity-40"
                            >
                              +
                            </button>

                          </div>

                          <AddToCartButton
                            product={product}
                            quantity={quantity}
                            onTerminar={() =>
                              resetQuantity(product)
                            }
                            className="flex-1 flex items-center justify-center gap-2 h-9 rounded-md text-xs font-bold"
                          >
                            <CartIcon />
                            Agregar
                          </AddToCartButton>

                        </div>
                        )}

                      </div>

                    </article>

                  );
                })}

              </div>

              )}

              {/* VER MÁS */}

              {!loading && !error && visibleProducts.length < shownProducts.length && (
                <div className="mt-8 flex flex-col items-center gap-3">
                  <p className="text-xs text-gray-400">
                    Mostrando {visibleProducts.length} de {shownProducts.length.toLocaleString("es-UY")} repuestos
                  </p>
                  <button
                    type="button"
                    onClick={seeMore}
                    className="h-11 px-8 rounded-md border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white text-sm font-black transition"
                  >
                    Ver más repuestos
                  </button>
                </div>
              )}

              {/* SIN RESULTADOS */}
              {/* Si la búsqueda no devuelve nada, se oculta la cuadrícula
                  (arriba) y se muestra este componente de retroalimentación
                  en su lugar. Si no hay búsqueda activa, se muestra un
                  mensaje genérico. */}

              {!loading && !error && shownProducts.length === 0 && (
                search.trim() ? (
                  <>
                    <NoSearchResults
                      termino={search.trim()}
                      onSearchInEverything={textWithoutSearch ? () => runSearch(textWithoutSearch) : undefined}
                    />
                    <AssistantInvite variante="sinResultados" termino={search.trim()} />
                  </>
                ) : (
                  <div className="py-20 text-center text-gray-400 text-sm">
                    {products.length > 0
                      ? "Ningún repuesto coincide con los filtros elegidos."
                      : categoria
                      ? `No hay productos en la categoría "${categoria}".`
                      : activeVehicle
                      ? "No encontramos repuestos para este vehículo."
                      : "No encontramos productos."}
                  </div>
                )
              )}

            </div>

          </div>

        </section>

      </main>

    </div>
  );
}
