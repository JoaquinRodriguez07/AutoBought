import { useEffect, useMemo, useState } from "react";
import Navbar from "./Navbar";
import SearchBar from "./SearchBar";
import { filtrarRepuestos } from "./filtrarRepuestos";
import SinResultadosBusqueda from "./SinResultadosBusqueda";
import { obtenerCategorias, obtenerRepuestos } from "./api";
import { useCart } from "./context/CartContext";

export default function Catalogo({
  // ==========================================
  // NAVBAR
  // ==========================================
  usuario,
  onHome,
  onCatalogo,
  onLogin,
  onMarcas,
  onCarrito,
  onFavoritos,

  // MENÚ DE USUARIO
  onPerfil,
  onDirecciones,
  onMetodosPago,
  onHistorial,
  onCerrarSesion,

  // CONTADORES
  cantidadFavoritos,

  // ==========================================
  // CATÁLOGO
  // ==========================================
  onDetalle,
  categoriaInicial,
  filtrosVehiculo,
  onCategoriaSeleccionada,
  onAlternarFavorito,
  esFavorito,
}) {
  const { addToCart } = useCart();

  // `categoria` en null significa "todas las categorías": es lo que
  // deja el botón "Limpiar filtros" y lo que se traduce en un
  // GET /api/v1/parts sin parámetros.
  //
  // El nombre de la categoría NO se inventa acá: se usa tal cual lo
  // manda quien navega (App.jsx / Home.jsx) o el que devuelve
  // GET /api/v1/parts/categories. Esta pantalla no tiene literales de
  // categoría ni traducciones propias.
  const [categoria, setCategoria] = useState(
    categoriaInicial || null
  );

  const [orden, setOrden] = useState("Más relevantes");
  const [busqueda, setBusqueda] = useState("");
  const [cantidades, setCantidades] = useState({});

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

  const [reintento, setReintento] = useState(0);
  const claveVehiculo = `${filtrosVehiculo?.brand ?? ""}|${
    filtrosVehiculo?.model ?? ""
  }|${filtrosVehiculo?.year ?? ""}`;
  const clavePedido = `${reintento}|${categoria ?? ""}|${claveVehiculo}`;

  const [respuesta, setRespuesta] = useState({
    clave: null,
    productos: [],
    error: "",
  });

  const cargando = respuesta.clave !== clavePedido;
  const productos = respuesta.productos;
  const error = respuesta.error;

  const [reintentoCategorias, setReintentoCategorias] = useState(0);

  const claveCategorias = String(reintentoCategorias);

  const [respuestaCategorias, setRespuestaCategorias] = useState({
    clave: null,
    categorias: [],
    error: "",
  });

  const cargandoCategorias =
    respuestaCategorias.clave !== claveCategorias;
  const categorias = respuestaCategorias.categorias;
  const errorCategorias = respuestaCategorias.error;

  // ==========================================
  // ACTUALIZAR CATEGORÍA
  // ==========================================
  // Se entra al catálogo desde Home ya filtrado por una categoría
  // (App.jsx pasa `categoriaCatalogo`); ese camino se mantiene.

  useEffect(() => {
    setCategoria(categoriaInicial || null);
  }, [categoriaInicial]);

  // ==========================================
  // CARGAR REPUESTOS
  // ==========================================
  // El filtro por categoría y por vehículo (marca, modelo, año) son del
  // servidor: cada clic en el sidebar o cambio de vehículo dispara un
  // fetch nuevo. `activo` descarta respuestas viejas si el usuario
  // cambia de filtro antes de que llegue la anterior.

  useEffect(() => {
    let activo = true;

    obtenerRepuestos({
      categoria: categoria || undefined,
      brand: filtrosVehiculo?.brand || undefined,
      model: filtrosVehiculo?.model || undefined,
      year: filtrosVehiculo?.year || undefined,
    })
      .then((lista) => {
        if (!activo) return;
        setRespuesta({
          clave: clavePedido,
          productos: lista,
          error: "",
        });
      })
      .catch((e) => {
        if (!activo) return;
        setRespuesta({
          clave: clavePedido,
          productos: [],
          error: e.message || "No pudimos cargar los repuestos.",
        });
      });

    return () => {
      activo = false;
    };
  }, [categoria, claveVehiculo, clavePedido]);

  // ==========================================
  // CARGAR CATEGORÍAS
  // ==========================================
  // El sidebar es 100% data-driven: los nombres y las cantidades son
  // los que devuelve GET /api/v1/parts/categories, sin lista fija ni
  // traducciones en el frontend.

  useEffect(() => {
    let activo = true;

    obtenerCategorias()
      .then((lista) => {
        if (!activo) return;
        setRespuestaCategorias({
          clave: claveCategorias,
          categorias: lista,
          error: "",
        });
      })
      .catch((e) => {
        if (!activo) return;
        setRespuestaCategorias({
          clave: claveCategorias,
          categorias: [],
          error:
            e.message || "No pudimos cargar las categorías.",
        });
      });

    return () => {
      activo = false;
    };
  }, [claveCategorias]);

  // ==========================================
  // PRODUCTOS MOSTRADOS
  // ==========================================
  // La categoría y el vehículo ya vienen filtrados por el backend, así
  // que NO se le pasan a filtrarRepuestos: esa función solo se ocupa de
  // la búsqueda por texto y del orden, que siguen siendo del lado del
  // cliente.

  const productosMostrados = useMemo(
    () => filtrarRepuestos(productos, { busqueda, orden }),
    [productos, busqueda, orden]
  );

  // ==========================================
  // LIMPIAR FILTROS
  // ==========================================
  // Sin categoría seleccionada, el efecto de arriba vuelve a pedir
  // GET /api/v1/parts sin ese parámetro (el vehículo, si hay uno
  // seleccionado, se mantiene: "Limpiar filtros" es solo de categoría
  // y búsqueda).

  const hayFiltros = Boolean(categoria) || Boolean(busqueda.trim());

  // La categoría vive en dos lados: acá y en App (`categoriaCatalogo`,
  // que es lo que vuelve como `categoriaInicial` al entrar de nuevo al
  // catálogo). Se cambian siempre juntas: si solo se limpiara la de
  // acá, volver con el botón Atrás reaplicaría el filtro viejo.
  const cambiarCategoria = (nueva) => {
    setCategoria(nueva);
    onCategoriaSeleccionada?.(nueva);
  };

  const limpiarFiltros = () => {
    cambiarCategoria(null);
    setBusqueda("");
  };

  // ==========================================
  // CAMBIAR CANTIDAD
  // ==========================================
  // No deja pedir más de lo que hay en stock.

  const cambiarCantidad = (producto, cambio) => {
    setCantidades((actual) => {
      const actualCant = actual[producto.id] || 1;
      const nueva = Math.min(
        producto.stock,
        Math.max(1, actualCant + cambio)
      );
      return { ...actual, [producto.id]: nueva };
    });
  };

  // ==========================================
  // AGREGAR AL CARRITO
  // ==========================================

  const agregar = (producto) => {
    if (producto.stock === 0) return;

    addToCart(producto, cantidades[producto.id] || 1);

    setCantidades((actual) => ({
      ...actual,
      [producto.id]: 1,
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
        paginaActual="catalogo"

        usuario={usuario}

        onHome={onHome}
        onCatalogo={onCatalogo}
        onLogin={onLogin}
        onMarcas={onMarcas}
        onCarrito={onCarrito}
        onFavoritos={onFavoritos}

        // MENÚ DE USUARIO
        onPerfil={onPerfil}
        onDirecciones={onDirecciones}
        onMetodosPago={onMetodosPago}
        onHistorial={onHistorial}
        onCerrarSesion={onCerrarSesion}

        cantidadFavoritos={cantidadFavoritos}
      />

      {/* =================================================
          CONTENIDO
      ================================================== */}

      <main className="pt-[88px]">

        {/* =================================================
            ENCABEZADO
        ================================================== */}

        <section className="bg-[#f5f5f5] px-5 md:px-10 py-7">

          <div className="max-w-[1200px] mx-auto">

            <p className="text-[9px] text-gray-400">
              Inicio › Repuestos › {categoria || "Todos"}
            </p>

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mt-5">

              {/* VEHÍCULO */}

              <div className="bg-[#151719] text-white rounded-lg px-5 py-4 min-w-[430px]">

                <p className="text-[9px] text-gray-400">
                  Vehículo seleccionado:
                </p>

                <div className="flex items-center gap-3 mt-1">

                  <span className="text-xl">
                    🚗
                  </span>

                  <p className="text-[14px] font-black">
                    {filtrosVehiculo?.brand && filtrosVehiculo?.model
                      ? `${filtrosVehiculo.brand} ${filtrosVehiculo.model}${
                          filtrosVehiculo.year
                            ? ` ${filtrosVehiculo.year}`
                            : ""
                        }`
                      : "Sin vehículo seleccionado"}
                  </p>

                  <button
                    type="button"
                    onClick={onHome}
                    className="text-orange-500 text-[9px] font-bold underline"
                  >
                    Cambiar
                  </button>

                </div>

              </div>

              {/* BUSCADOR */}

              <SearchBar
                value={busqueda}
                onChange={setBusqueda}
                onSubmit={setBusqueda}
                placeholder="Buscar repuesto por nombre, categoría, marca, código..."
                className="lg:max-w-[475px]"
              />

            </div>

          </div>

        </section>

        {/* =================================================
            CATÁLOGO
        ================================================== */}

        <section className="max-w-[1200px] mx-auto px-5 md:px-10 py-7">

          <div className="grid grid-cols-1 lg:grid-cols-[210px_1fr] gap-7">

            {/* =================================================
                SIDEBAR
            ================================================== */}

            <aside>

              <p className="text-[10px] font-black uppercase mb-4">
                Categorías
              </p>

              <div className="space-y-1">

                {/* CATEGORÍAS: CARGANDO */}

                {cargandoCategorias && (

                  <p className="px-3 py-3 text-[9px] text-gray-400">
                    Cargando categorías…
                  </p>

                )}

                {categorias.map((item) => (

                  <button
                    key={item.nombre}
                    type="button"
                    onClick={() =>
                      cambiarCategoria(item.nombre)
                    }
                    className={`w-full flex items-center justify-between px-3 py-3 rounded-md text-left transition ${
                      categoria === item.nombre
                        ? "bg-orange-50 text-orange-500 border-l-2 border-orange-500"
                        : "hover:bg-gray-50 text-gray-700"
                    }`}
                  >

                    <span className="text-[10px] font-semibold">
                      {item.nombre}
                    </span>

                    <span className="text-[9px] bg-gray-100 rounded-full px-2 py-1">
                      {item.cantidad}
                    </span>

                  </button>

                ))}

                {/* CATEGORÍAS: ERROR */}

                {!cargandoCategorias && errorCategorias && (

                  <div className="px-3 py-3">

                    <p className="text-[9px] text-gray-400">
                      {errorCategorias}
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        setReintentoCategorias((v) => v + 1)
                      }
                      className="text-[9px] font-bold text-orange-500 underline mt-1"
                    >
                      Reintentar
                    </button>

                  </div>

                )}

              </div>

              {/* LIMPIAR FILTROS */}

              <button
                type="button"
                onClick={limpiarFiltros}
                disabled={!hayFiltros}
                className="w-full mt-3 px-3 py-3 rounded-md border border-orange-500 text-orange-500 text-[9px] font-bold transition hover:bg-orange-500 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-orange-500"
              >
                Limpiar filtros
              </button>

              {/* MARCAS */}
              {/* DEUDA CONOCIDA (el usuario decidió dejarlo así por ahora):
                  estos cinco checkboxes están hardcodeados y no filtran
                  nada. Al no ser controlados, el navegador les guarda el
                  tilde, pero `hayFiltros` los ignora y `limpiarFiltros()`
                  no los destilda: se pueden marcar dos, ver que el conteo
                  de resultados no cambia y encontrar "Limpiar filtros"
                  deshabilitado al lado. Además son fabricantes de
                  repuestos (Bosch, TRW...) mientras que `compatible_brands`
                  del backend son marcas de vehículo (Chevrolet, Volkswagen,
                  Peugeot, Fiat, Ford, Renault, Toyota, Citroen, Kia), así
                  que no coincidirían con nada ni aunque se cablearan. */}

              <div className="border-t border-gray-100 mt-5 pt-5">

                <p className="text-[10px] font-black uppercase mb-4">
                  Marca
                </p>

                {[
                  "Bosch",
                  "TRW",
                  "Brembo",
                  "ATE",
                  "Ferodo",
                ].map((marca) => (

                  <label
                    key={marca}
                    className="flex items-center gap-2 py-2 cursor-pointer"
                  >

                    <input
                      type="checkbox"
                      className="accent-orange-500"
                    />

                    <span className="text-[9px] text-gray-600">
                      {marca}
                    </span>

                  </label>

                ))}

              </div>

            </aside>

            {/* =================================================
                PRODUCTOS
            ================================================== */}

            <div>

              {/* ORDEN */}

              <div className="flex items-center justify-between mb-5">

                <p className="text-[11px] font-bold">

                  {cargando ? (

                    "Cargando repuestos…"

                  ) : (
                    <>

                      Mostrando{" "}

                      <span className="text-orange-500">
                        {productosMostrados.length}
                      </span>{" "}

                      resultados

                    </>
                  )}

                </p>

                <select
                  value={orden}
                  onChange={(e) =>
                    setOrden(e.target.value)
                  }
                  className="border border-gray-200 rounded-md px-3 py-2 text-[9px] outline-none"
                >

                  <option>
                    Más relevantes
                  </option>

                  <option>
                    Menor precio
                  </option>

                  <option>
                    Mayor precio
                  </option>

                </select>

              </div>

              {/* CARGANDO */}

              {cargando && (
                <div className="py-20 text-center text-gray-400 text-sm">
                  Cargando repuestos…
                </div>
              )}

              {/* ERROR */}
              {/* Si la API falla no se muestran datos de mentira: se
                  avisa del error y se ofrece reintentar. */}

              {!cargando && error && (

                <div className="py-20 text-center">

                  <p className="text-sm text-gray-500">
                    {error}
                  </p>

                  <button
                    type="button"
                    onClick={() => setReintento((v) => v + 1)}
                    className="mt-4 px-4 h-9 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white rounded-md text-[9px] font-bold transition"
                  >
                    Reintentar
                  </button>

                </div>

              )}

              {/* GRID */}
              {/* Se oculta por completo cuando no hay resultados: la
                  retroalimentación la muestra SinResultadosBusqueda
                  (o el mensaje genérico) más abajo. */}

              {!cargando && !error && productosMostrados.length > 0 && (

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

                {productosMostrados.map((producto) => {

                  const cantidad =
                    cantidades[producto.id] || 1;

                  const favorito =
                    esFavorito(producto.id);

                  return (

                    <div
                      key={producto.id}
                      className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition"
                    >

                      {/* IMAGEN */}

                      <div className="relative h-[190px] bg-gray-50">

                        {/* Sin filtro, el catálogo completo son ~377
                            tarjetas: lazy evita decodificar todas las
                            imágenes que están fuera de pantalla. */}

                        <img
                          src={producto.imagen}
                          alt={producto.nombre}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            onAlternarFavorito(producto)
                          }
                          className={`absolute top-3 right-3 w-9 h-9 rounded-full bg-white shadow-md text-lg ${
                            favorito
                              ? "text-orange-500"
                              : "text-gray-500"
                          }`}
                        >
                          {favorito ? "♥" : "♡"}
                        </button>

                      </div>

                      {/* INFORMACIÓN */}

                      <div className="p-4">

                        <p className="text-[9px] font-black">
                          {producto.marcaPrincipal ?? producto.marca}
                        </p>

                        <h3 className="text-[11px] font-bold mt-2 leading-tight min-h-[30px]">
                          {producto.nombre}
                        </h3>

                        <p className="text-[9px] text-gray-400 mt-2">
                          Código: {producto.codigo}
                        </p>

                        <p className="text-lg font-black mt-4">
                          $
                          {producto.precio.toLocaleString(
                            "es-UY"
                          )}
                        </p>

                        {producto.stock === 0 ? (
                          <p className="text-[9px] text-red-500 font-bold mt-2">
                            Sin stock
                          </p>
                        ) : (
                          <p className="text-[9px] text-green-600 font-bold mt-2">
                            En stock · {producto.stock} unidades
                          </p>
                        )}

                        {/* CANTIDAD + AGREGAR */}

                        <div className="flex items-center justify-between mt-4">

                          <div className="flex border border-gray-200 rounded-md">

                            <button
                              type="button"
                              onClick={() =>
                                cambiarCantidad(
                                  producto,
                                  -1
                                )
                              }
                              disabled={producto.stock === 0}
                              className="w-7 h-8 disabled:opacity-40"
                            >
                              −
                            </button>

                            <span className="w-7 flex items-center justify-center text-[9px]">
                              {producto.stock === 0 ? 0 : cantidad}
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                cambiarCantidad(
                                  producto,
                                  1
                                )
                              }
                              disabled={
                                producto.stock === 0 ||
                                cantidad >= producto.stock
                              }
                              className="w-7 h-8 disabled:opacity-40"
                            >
                              +
                            </button>

                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              agregar(producto)
                            }
                            disabled={producto.stock === 0}
                            className={`px-3 h-8 rounded-md text-[8px] font-black ${
                              producto.stock === 0
                                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                : "bg-orange-500 hover:bg-orange-600 text-white"
                            }`}
                          >
                            {producto.stock === 0 ? "SIN STOCK" : "🛒 AGREGAR"}
                          </button>

                        </div>

                        {/* DETALLE */}

                        <button
                          type="button"
                          onClick={() =>
                            onDetalle(producto)
                          }
                          className="w-full h-9 mt-2 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white rounded-md text-[9px] font-bold transition"
                        >
                          Ver detalle
                        </button>

                      </div>

                    </div>

                  );
                })}

              </div>

              )}

              {/* SIN RESULTADOS */}
              {/* Si la búsqueda no devuelve nada, se oculta la cuadrícula
                  (arriba) y se muestra este componente de retroalimentación
                  en su lugar. Si no hay búsqueda activa (ej: categoría sin
                  productos cargados), se muestra un mensaje genérico. */}

              {!cargando && !error && productosMostrados.length === 0 && (
                busqueda.trim() ? (
                  <SinResultadosBusqueda termino={busqueda.trim()} />
                ) : (
                  <div className="py-20 text-center text-gray-400 text-sm">
                    {categoria
                      ? `No hay productos en la categoría "${categoria}".`
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
