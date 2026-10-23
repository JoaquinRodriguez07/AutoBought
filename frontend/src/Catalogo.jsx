import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import BotonAvisoStock from "./BotonAvisoStock";
import Navbar from "./Navbar";
import ConfirmacionAgregarCarrito from "./ConfirmacionAgregarCarrito";
import SearchBar from "./SearchBar";
import ActiveVehicleBanner from "./ActiveVehicleBanner";
import EncabezadoPagina from "./EncabezadoPagina";
import FiltrosCatalogo from "./FiltrosCatalogo";
import { IconoCarrito, IconoCerrar, IconoCorazon, IconoFiltros } from "./Iconos";
import { filtrarRepuestos } from "./filtrarRepuestos";
import SinResultadosBusqueda from "./SinResultadosBusqueda";
import { buscarTexto, obtenerCategorias, obtenerRepuestos } from "./api";
import { useCart } from "./context/CartContext";
import { useVehicle } from "./context/VehicleContext";

// ==========================================
// AYUDAS DE LOS FILTROS
// ==========================================

// Cuántos repuestos hay de cada opción ([nombre, cantidad]). `valores`
// devuelve las opciones de un repuesto (un fabricante, varias marcas).
function contarOpciones(productos, valores, seleccionados) {
  const cantidades = new Map(seleccionados.map((s) => [s, 0]));
  for (const p of productos) {
    for (const valor of valores(p)) {
      cantidades.set(valor, (cantidades.get(valor) ?? 0) + 1);
    }
  }
  return [...cantidades];
}

// Para los setState de listas: saca un valor, o lo pone si no está.
const sin = (valor) => (lista) => lista.filter((v) => v !== valor);
const alternar = (valor) => (lista) =>
  lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];

const pesos = (valor) => `$${Number(valor).toLocaleString("es-UY")}`;

function textoPrecio(min, max) {
  if (min !== "" && max !== "") return `${pesos(min)} – ${pesos(max)}`;
  return min !== "" ? `Desde ${pesos(min)}` : `Hasta ${pesos(max)}`;
}

// "Para Chevrolet Onix, Prisma" si es de una sola marca y pocos modelos;
// si es de muchas, solo las marcas, o "Para varias marcas".
function textoCompatibilidad({ marcas = [], modelos = [] }) {
  if (marcas.length === 0) return "";
  if (marcas.length === 1 && modelos.length > 0 && modelos.length <= 3) {
    return `Para ${marcas[0]} ${modelos.join(", ")}`;
  }
  if (marcas.length <= 3) return `Para ${marcas.join(", ")}`;
  return "Para varias marcas";
}

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
  onCategoriaSeleccionada,
  onAlternarFavorito,
  esFavorito,
  onAlternarAvisoStock,
  tieneAvisoStock = () => false,
}) {
  const { addToCart, deshacerAgregado } = useCart();

  // Vehículo Activo (el que se confirmó con "Buscar Repuestos"). Vive en
  // VehicleContext, así que sobrevive a ir al carrito y volver.
  const { vehiculoActivo, limpiarVehiculo, activarVehiculo } = useVehicle();

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
  const [searchParams, setSearchParams] = useSearchParams();
  const consulta = (searchParams.get("q") || "").trim();
  // Si se entra con ?q= (desde la barra del menú), la búsqueda se ve en
  // la barra del catálogo.
  const [busqueda, setBusqueda] = useState(consulta);
  const [fabricantes, setFabricantes] = useState(() => {
    const desdeInicio = searchParams.get("fabricante");
    return desdeInicio ? [desdeInicio] : [];
  });
  const [marcasAuto, setMarcasAuto] = useState(() => {
    const desdeInicio = searchParams.get("marca");
    return desdeInicio ? [desdeInicio] : [];
  });
  const [precioMin, setPrecioMin] = useState("");
  const [precioMax, setPrecioMax] = useState("");
  const [soloConStock, setSoloConStock] = useState(false);
  // En celular los filtros se esconden detrás de un botón.
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [cantidades, setCantidades] = useState({});
  const [productoAgregado, setProductoAgregado] = useState(null);


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
  const claveVehiculo = `${vehiculoActivo?.brand ?? ""}|${
    vehiculoActivo?.model ?? ""
  }|${vehiculoActivo?.year ?? ""}`;
  const clavePedido = `${reintento}|${categoria ?? ""}|${claveVehiculo}`;

  const [respuesta, setRespuesta] = useState({
    clave: null,
    productos: [],
    error: "",
  });

  const cargando = consulta
    ? respuesta.clave !== `libre|${consulta}`
    : respuesta.clave !== clavePedido;
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
  // BÚSQUEDA LIBRE
  // ==========================================
  useEffect(() => {
  if (!consulta) return;

  let activo = true;

  buscarTexto(consulta)
    .then(({ parts, entities }) => {
      if (!activo) return;

      const tieneEntidades =
        entities &&
        (entities.part ||
          entities.brand ||
          entities.model ||
          entities.year ||
          entities.fuel);

      if (!tieneEntidades) {
        setRespuesta({
          clave: `libre|${consulta}`,
          productos: [],
          error:
            "No pudimos entender tu búsqueda, por favor usa el filtro de compatibilidad manual",
        });
        return;
      }

      if (entities.brand) {
        activarVehiculo({
          brand: entities.brand,
          model: entities.model || "",
          year: entities.year || "",
        });
      }

      setRespuesta({
        clave: `libre|${consulta}`,
        productos: parts,
        error: "",
      });
    })
    .catch((e) => {
      if (!activo) return;

      setRespuesta({
        clave: `libre|${consulta}`,
        productos: [],
        error: e.message || "No pudimos realizar la búsqueda.",
      });
    });

  return () => {
    activo = false;
  };
}, [consulta, activarVehiculo]);

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
    let activo = true;
    if (consulta) return;

    obtenerRepuestos({
      categoria: categoria || undefined,
      brand: vehiculoActivo?.brand || undefined,
      model: vehiculoActivo?.model || undefined,
      year: vehiculoActivo?.year || undefined,
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
  }, [categoria, vehiculoActivo, clavePedido, consulta]);

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
  // Categoría y vehículo ya vienen filtrados por el backend. La búsqueda
  // por texto (nombre, código, fabricante, marcas compatibles y
  // categoría), los filtros del sidebar (fabricante, precio, stock,
  // marca del auto) y el orden se resuelven en el navegador con
  // filtrarRepuestos, en vivo.

  const productosMostrados = useMemo(
    () =>
      filtrarRepuestos(productos, {
        // Lo que se buscó con Enter ya lo resolvió el servidor: no se
        // vuelve a filtrar por ese mismo texto.
        busqueda: busqueda.trim() === consulta ? "" : busqueda,
        fabricantes,
        marcasAuto,
        precioMin,
        precioMax,
        soloConStock,
        orden,
      }),
    [productos, busqueda, consulta, fabricantes, marcasAuto, precioMin, precioMax, soloConStock, orden]
  );

  // Las opciones de fabricante y marca del auto salen de los repuestos
  // cargados (con la categoría y el vehículo ya aplicados), con cuántos
  // hay de cada una. Las tildadas se muestran aunque ya no tengan
  // repuestos, para poder destildarlas.
  const opcionesFabricante = useMemo(
    () => contarOpciones(productos, (p) => (p.fabricante ? [p.fabricante] : []), fabricantes),
    [productos, fabricantes]
  );
  const opcionesMarca = useMemo(
    () => contarOpciones(productos, (p) => p.marcas ?? [], marcasAuto),
    [productos, marcasAuto]
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
  const cambiarCategoria = (nueva) => {
    if (consulta) {
      setSearchParams({});
      setBusqueda("");
    }

    setCategoria(nueva);
    onCategoriaSeleccionada?.(nueva);
  };

  const limpiarFiltros = () => {
    if (consulta) {
      setSearchParams({});
    }

    cambiarCategoria(null);
    setBusqueda("");
    setFabricantes([]);
    setMarcasAuto([]);
    setPrecioMin("");
    setPrecioMax("");
    setSoloConStock(false);
  };

  // Los filtros activos, como chips arriba de los resultados: cada uno
  // con lo que hay que hacer para quitarlo.
  const filtrosActivos = [
    categoria && { clave: "categoria", texto: categoria, quitar: () => cambiarCategoria(null) },
    busqueda.trim() && { clave: "busqueda", texto: `"${busqueda.trim()}"`, quitar: () => buscar("") },
    ...fabricantes.map((f) => ({ clave: `fabricante-${f}`, texto: f, quitar: () => setFabricantes(sin(f)) })),
    ...marcasAuto.map((m) => ({ clave: `marca-${m}`, texto: `Para ${m}`, quitar: () => setMarcasAuto(sin(m)) })),
    (precioMin !== "" || precioMax !== "") && {
      clave: "precio",
      texto: textoPrecio(precioMin, precioMax),
      quitar: () => {
        setPrecioMin("");
        setPrecioMax("");
      },
    },
    soloConStock && { clave: "stock", texto: "Con stock", quitar: () => setSoloConStock(false) },
  ].filter(Boolean);

  const hayFiltros = filtrosActivos.length > 0;

  // ==========================================
  // BUSCAR
  // ==========================================
  // Una sola barra: mientras se escribe filtra en vivo lo cargado
  // (filtrarRepuestos); con Enter o la lupa hace la búsqueda del servidor
  // (?q=), que entiende "pastillas onix 2020", errores y sinónimos.
  const buscar = (texto) => {
    const limpio = texto.trim();
    setBusqueda(limpio);
    setSearchParams(limpio ? { q: limpio } : {});
  };

  // Lo escrito que todavía no se buscó en el servidor: para eso se ofrece
  // el botón "Buscar ... en todo el catálogo" (así no hace falta saber
  // que existe el Enter).
  const textoSinBuscar = busqueda.trim() !== consulta ? busqueda.trim() : "";

  // "Borrar filtros" del banner: quita el vehículo activo Y el resto de
  // los filtros, para que el catálogo vuelva a la lista completa.
  const borrarVehiculoYFiltros = () => {
    limpiarVehiculo();
    limpiarFiltros();
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

  const agregar = async (producto) => {
    if (producto.stock === 0) return;

    const cantidadPedida = cantidades[producto.id] || 1;
    const agregado = await addToCart(producto, cantidadPedida);

    setCantidades((actual) => ({
      ...actual,
      [producto.id]: 1,
    }));

    if (agregado) {
      setProductoAgregado({ ...producto, cantidadAgregada: cantidadPedida });
    }
  };

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <ConfirmacionAgregarCarrito
        producto={productoAgregado}
        onDeshacer={(item) => deshacerAgregado(item.id, item.cantidadAgregada)}
        onCerrar={() => setProductoAgregado(null)}
        onVerCarrito={() => {
          setProductoAgregado(null);
          onCarrito();
        }}
      />

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
        mostrarBusqueda={false}
      />

      {/* =================================================
          CONTENIDO
      ================================================== */}

      <main>

        {/* =================================================
            ENCABEZADO
        ================================================== */}

        <EncabezadoPagina
          ancho="max-w-[1200px]"
          migas={[
            { texto: "Inicio", ir: onHome },
            { texto: "Repuestos", ir: () => cambiarCategoria(null) },
            categoria || "Todos",
          ]}
          titulo={categoria || "Todos los repuestos"}
          fin={
            <>

              {/* BUSCADOR */}

              <SearchBar
                value={busqueda}
                onChange={setBusqueda}
                onSubmit={buscar}
                placeholder="Buscar repuesto por nombre, código o fabricante..."
              />

              {textoSinBuscar && (
                <button
                  type="button"
                  onClick={() => buscar(textoSinBuscar)}
                  className="mt-2 text-sm text-gray-300 hover:text-orange-400 transition"
                >
                  Buscar <span className="font-bold text-white">"{textoSinBuscar}"</span> en todo el catálogo →
                </button>
              )}

            </>
          }
        >

          {/* VEHÍCULO ACTIVO */}
          {/* Oculto si no hay vehículo activo en VehicleContext. */}

          {vehiculoActivo && (
            <ActiveVehicleBanner
              onCambiar={onHome}
              onBorrar={borrarVehiculoYFiltros}
            />
          )}

        </EncabezadoPagina>

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
              className={`${filtrosAbiertos ? "block" : "hidden"} lg:block`}
            >

              <FiltrosCatalogo
                categorias={categorias}
                cargandoCategorias={cargandoCategorias}
                errorCategorias={errorCategorias}
                onReintentarCategorias={() => setReintentoCategorias((v) => v + 1)}
                categoria={categoria}
                onCategoria={cambiarCategoria}
                opcionesFabricante={opcionesFabricante}
                fabricantes={fabricantes}
                onAlternarFabricante={(f) => setFabricantes(alternar(f))}
                opcionesMarca={opcionesMarca}
                marcasAuto={marcasAuto}
                onAlternarMarca={(m) => setMarcasAuto(alternar(m))}
                precioMin={precioMin}
                precioMax={precioMax}
                onPrecioMin={setPrecioMin}
                onPrecioMax={setPrecioMax}
                soloConStock={soloConStock}
                onSoloConStock={setSoloConStock}
              />

            </aside>

            {/* =================================================
                PRODUCTOS
            ================================================== */}

            <div className="min-w-0">

              {/* RESULTADOS + ORDEN */}

              <div className="flex flex-wrap items-center gap-3 mb-4">

                <p className="text-sm font-bold mr-auto">

                  {cargando ? (

                    "Cargando repuestos…"

                  ) : (
                    <>

                      <span className="text-orange-500">
                        {productosMostrados.length}
                      </span>{" "}

                      {productosMostrados.length === 1 ? "resultado" : "resultados"}

                    </>
                  )}

                </p>

                <button
                  type="button"
                  onClick={() => setFiltrosAbiertos((v) => !v)}
                  aria-expanded={filtrosAbiertos}
                  className="lg:hidden flex items-center gap-2 border border-gray-200 rounded-md px-3 h-9 text-sm font-bold"
                >
                  <IconoFiltros />
                  {filtrosAbiertos ? "Ocultar filtros" : "Filtros"}
                  {filtrosActivos.length > 0 && (
                    <span className="bg-orange-500 text-white rounded-full px-1.5 text-[11px]">
                      {filtrosActivos.length}
                    </span>
                  )}
                </button>

                <label className="flex items-center gap-2 text-sm text-gray-500">
                  Ordenar por
                  <select
                    value={orden}
                    onChange={(e) =>
                      setOrden(e.target.value)
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

              {hayFiltros && (

                <div className="flex flex-wrap items-center gap-2 mb-5">

                  {filtrosActivos.map((filtro) => (
                    <button
                      key={filtro.clave}
                      type="button"
                      onClick={filtro.quitar}
                      aria-label={`Quitar filtro ${filtro.texto}`}
                      className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 rounded-full pl-3 pr-2 h-8 text-xs font-semibold transition"
                    >
                      {filtro.texto}
                      <IconoCerrar className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={limpiarFiltros}
                    className="text-xs font-bold text-orange-500 hover:underline ml-1"
                  >
                    Limpiar filtros
                  </button>

                </div>

              )}

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

              {!cargando && !error && productosMostrados.length > 0 && (

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">

                {productosMostrados.map((producto) => {

                  const cantidad =
                    cantidades[producto.id] || 1;

                  const favorito =
                    esFavorito(producto.id);

                  const sinStock = producto.stock === 0;

                  const compatibilidad = textoCompatibilidad(producto);

                  return (

                    <article
                      key={producto.id}
                      className="flex flex-col bg-white border border-gray-100 rounded-xl overflow-hidden shadow-xs hover:shadow-lg transition"
                    >

                      {/* IMAGEN */}

                      <div className="relative h-[180px] bg-gray-50">

                        {/* Sin filtro, el catálogo completo son más de
                            mil tarjetas: lazy evita decodificar todas
                            las imágenes que están fuera de pantalla. */}

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
                          aria-label={favorito ? "Quitar de favoritos" : "Marcar como favorito"}
                          aria-pressed={favorito}
                          className={`absolute top-3 right-3 w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center transition hover:scale-105 ${
                            favorito
                              ? "text-orange-500"
                              : "text-gray-500"
                          }`}
                        >
                          <IconoCorazon lleno={favorito} className="w-5 h-5" />
                        </button>

                      </div>

                      {/* INFORMACIÓN */}

                      <div className="flex flex-col flex-1 p-4">

                        <p className="text-[11px] font-black uppercase tracking-wide text-orange-500">
                          {producto.fabricante}
                        </p>

                        <h3 className="text-sm font-bold mt-1 leading-snug">
                          {producto.nombre}
                        </h3>

                        {compatibilidad && (
                          <p className="text-xs text-gray-500 mt-1">
                            {compatibilidad}
                          </p>
                        )}

                        <p className="text-[11px] text-gray-400 mt-1">
                          Código: {producto.codigo}
                        </p>

                        <div className="mt-auto pt-4 flex items-end justify-between gap-2">

                          <p className="text-xl font-black">
                            {pesos(producto.precio)}
                          </p>

                          {sinStock ? (
                            <p className="text-xs text-red-500 font-bold">
                              Sin stock
                            </p>
                          ) : (
                            <p className="text-xs text-green-600 font-bold">
                              {producto.stock} en stock
                            </p>
                          )}

                        </div>

                        {sinStock && (
                          <BotonAvisoStock
                            producto={producto}
                            tieneAviso={tieneAvisoStock(producto.partId)}
                            onAlternarAviso={onAlternarAvisoStock}
                            className="mt-2 self-start"
                          />
                        )}

                        {/* CANTIDAD + AGREGAR */}

                        <div className="flex items-center gap-2 mt-4">

                          <div className="flex border border-gray-200 rounded-md">

                            <button
                              type="button"
                              onClick={() =>
                                cambiarCantidad(
                                  producto,
                                  -1
                                )
                              }
                              disabled={sinStock}
                              className="w-8 h-9 disabled:opacity-40"
                            >
                              −
                            </button>

                            <span className="w-8 flex items-center justify-center text-sm">
                              {sinStock ? 0 : cantidad}
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
                                sinStock ||
                                cantidad >= producto.stock
                              }
                              className="w-8 h-9 disabled:opacity-40"
                            >
                              +
                            </button>

                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              agregar(producto)
                            }
                            disabled={sinStock}
                            className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-md text-xs font-bold transition ${
                              sinStock
                                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                : "bg-orange-500 hover:bg-orange-600 text-white"
                            }`}
                          >
                            {sinStock ? (
                              "Sin stock"
                            ) : (
                              <>
                                <IconoCarrito />
                                Agregar
                              </>
                            )}
                          </button>

                        </div>

                        {/* DETALLE */}

                        <button
                          type="button"
                          onClick={() =>
                            onDetalle(producto)
                          }
                          className="w-full h-9 mt-2 border border-gray-200 hover:border-orange-500 hover:text-orange-500 rounded-md text-xs font-bold transition"
                        >
                          Ver detalle
                        </button>

                      </div>

                    </article>

                  );
                })}

              </div>

              )}

              {/* SIN RESULTADOS */}
              {/* Si la búsqueda no devuelve nada, se oculta la cuadrícula
                  (arriba) y se muestra este componente de retroalimentación
                  en su lugar. Si no hay búsqueda activa, se muestra un
                  mensaje genérico. */}

              {!cargando && !error && productosMostrados.length === 0 && (
                busqueda.trim() ? (
                  <SinResultadosBusqueda
                    termino={busqueda.trim()}
                    onBuscarEnTodo={textoSinBuscar ? () => buscar(textoSinBuscar) : undefined}
                  />
                ) : (
                  <div className="py-20 text-center text-gray-400 text-sm">
                    {productos.length > 0
                      ? "Ningún repuesto coincide con los filtros elegidos."
                      : categoria
                      ? `No hay productos en la categoría "${categoria}".`
                      : vehiculoActivo
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
