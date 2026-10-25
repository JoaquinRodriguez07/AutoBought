import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import EncabezadoPagina from "./EncabezadoPagina";
import { useParams } from "react-router-dom";
import BotonAgregarCarrito from "./BotonAgregarCarrito";
import BotonAvisoStock from "./BotonAvisoStock";
import { useVehicle } from "./context/VehicleContext";
import VehicleSelector from "./VehicleSelector";
import { IconoAuto } from "./Iconos";
import { obtenerRepuesto } from "./api";
import { extraerIdProducto } from "./slugProducto";

function IconoCarrito({ className = "h-4 w-4" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="9" cy="20" r="1" />
      <circle cx="19" cy="20" r="1" />
      <path d="M2 3h2l2.6 12.2a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L22 7H5" />
    </svg>
  );
}

function IconoCorazon({ className = "h-5 w-5", relleno = false }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill={relleno ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    </svg>
  );
}

export default function DetalleProducto({
  onHome,
  onLogin,
  onMarcas,
  onCatalogo,
  onCarrito,
  onFavoritos,
  cantidadFavoritos,
  producto,
  onAlternarFavorito,
  esFavorito,
  onAlternarAvisoStock,
  tieneAvisoStock = () => false,
  usuario,
  onPerfil,
  onDirecciones,
  onMetodosPago,
  onHistorial,
  onCerrarSesion,
}) {
  const { vehiculoActivo: filtrosVehiculo, activarVehiculo } = useVehicle();
  const { id: slugDesdeUrl } = useParams();
  const idDesdeUrl = extraerIdProducto(slugDesdeUrl);
  const [detalleCargado, setDetalleCargado] = useState({ id: null, estado: "cargando", producto: null });
  const [cantidad, setCantidad] = useState(1);
  const [imagenActiva, setImagenActiva] = useState(0);
  const [editandoVehiculo, setEditandoVehiculo] = useState(false);
  const [selectorVehiculoMontado, setSelectorVehiculoMontado] = useState(false);

  useEffect(() => {
    if (!idDesdeUrl) return;

    let vigente = true;
    setDetalleCargado({ id: idDesdeUrl, estado: "cargando", producto: null });
    obtenerRepuesto(idDesdeUrl)
      .then((repuesto) => {
        if (vigente) {
          setDetalleCargado({ id: idDesdeUrl, estado: "listo", producto: repuesto });
        }
      })
      .catch((error) => {
        if (vigente) {
          setDetalleCargado({
            id: idDesdeUrl,
            estado: error.status === 404 ? "no-encontrado" : "error",
            producto: null,
          });
        }
      });

    return () => {
      vigente = false;
    };
  }, [idDesdeUrl]);

  const estadoCarga = idDesdeUrl
    ? detalleCargado.id === idDesdeUrl ? detalleCargado.estado : "cargando"
    : producto ? "listo" : "no-encontrado";
  const productoActual = idDesdeUrl
    ? detalleCargado.id === idDesdeUrl && detalleCargado.estado === "listo"
      ? detalleCargado.producto
      : null
    : producto;

  const navbar = (
    <Navbar paginaActual="detalle" onHome={onHome} onCatalogo={onCatalogo} onLogin={onLogin}
      onMarcas={onMarcas} onCarrito={onCarrito} onFavoritos={onFavoritos}
      usuario={usuario} onPerfil={onPerfil} onDirecciones={onDirecciones}
      onMetodosPago={onMetodosPago} onHistorial={onHistorial} onCerrarSesion={onCerrarSesion}
      cantidadFavoritos={cantidadFavoritos} />
  );

  if (estadoCarga !== "listo" || !productoActual) {
    const mensaje = estadoCarga === "cargando"
      ? "Cargando"
      : estadoCarga === "no-encontrado"
        ? "Repuesto no encontrado"
        : "No se pudo cargar el repuesto.";
    return (
      <div className="min-h-screen bg-white text-gray-900 font-sans">
        {navbar}
        <main className="mx-auto max-w-[1200px] px-5 pt-36 md:px-10">
          <p role={estadoCarga === "cargando" ? "status" : "alert"} className="text-sm text-gray-700">{mensaje}</p>
        </main>
      </div>
    );
  }
  const favorito = esFavorito(productoActual.id);
  // Cada repuesto tiene una sola imagen (la de su tipo y fabricante). Las
  // miniaturas se muestran solo si hay más de una vista distinta: repetir
  // la misma foto tres veces no aporta nada.
  const imagenes = [...new Set([productoActual.imagen, ...(productoActual.imagenesExtra ?? [])].filter(Boolean))];
  const abrirSelectorVehiculo = () => {
    setSelectorVehiculoMontado(true);
    setEditandoVehiculo(true);
  };
  const cerrarSelectorVehiculo = () => {
    setEditandoVehiculo(false);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setSelectorVehiculoMontado(false);
    }
  };
  const finalizarTransicionSelector = (event) => {
    if (event.target === event.currentTarget && !editandoVehiculo) {
      setSelectorVehiculoMontado(false);
    }
  };

  const normalizar = (valor) => valor?.trim().replace(/\s+/g, " ").toLocaleLowerCase("es") || "";
  const marcaSeleccionada = normalizar(filtrosVehiculo?.brand);
  const modeloSeleccionado = normalizar(filtrosVehiculo?.model);
  const anioSeleccionado = filtrosVehiculo?.year ? Number(filtrosVehiculo.year) : null;
  const nombreVehiculo = [filtrosVehiculo?.brand, filtrosVehiculo?.model, filtrosVehiculo?.year].filter(Boolean).join(" ");
  // La API puede entregar compatibilidades estructuradas o aplicaciones como texto.
  // Normalizamos ambas formas para que la tarjeta no indique "no disponible"
  // cuando el producto sí trae aplicaciones registradas.
  const compatibilidadesEstructuradas = Array.isArray(productoActual.compatibilidades)
    ? productoActual.compatibilidades
    : [];
  const aplicacionesTexto = Array.isArray(productoActual.aplicaciones)
    ? productoActual.aplicaciones.filter((item) => typeof item === "string" && item.trim())
    : [];
  const compatibilidades = compatibilidadesEstructuradas.length
    ? compatibilidadesEstructuradas.map((item) => ({ ...item, formatoTexto: false }))
    : aplicacionesTexto.map((texto) => ({ texto: texto.trim(), formatoTexto: true }));

  const compatible = marcaSeleccionada && compatibilidades.length > 0
    ? (() => {
        let hayDatosInsuficientes = false;

        for (const compatibilidad of compatibilidades) {
          if (compatibilidad.formatoTexto) {
            const aplicacion = normalizar(compatibilidad.texto);
            const marcaCoincide = aplicacion.includes(marcaSeleccionada);
            if (!marcaCoincide) continue;
            if (!modeloSeleccionado) return true;
            if (!aplicacion.includes(modeloSeleccionado)) continue;
            if (!anioSeleccionado) return true;

            // En aplicaciones textuales solo afirmamos compatibilidad por año
            // si el año seleccionado aparece explícitamente en la aplicación.
            const aniosExplicitos = aplicacion.match(/\b(?:19|20)\d{2}\b/g) || [];
            if (aniosExplicitos.includes(String(anioSeleccionado))) return true;
            if (aniosExplicitos.length === 0) hayDatosInsuficientes = true;
            continue;
          }

          const marcaAplicacion = normalizar(compatibilidad.brand);
          if (!marcaAplicacion) {
            hayDatosInsuficientes = true;
            continue;
          }
          if (marcaAplicacion !== marcaSeleccionada) continue;
          if (!modeloSeleccionado) return true;

          const modeloAplicacion = normalizar(compatibilidad.model);
          if (!modeloAplicacion) {
            hayDatosInsuficientes = true;
            continue;
          }
          if (modeloAplicacion !== modeloSeleccionado) continue;
          if (!anioSeleccionado) return true;

          if (compatibilidad.year_from == null || compatibilidad.year_to == null) {
            hayDatosInsuficientes = true;
            continue;
          }
          const anioDesde = Number(compatibilidad.year_from);
          const anioHasta = Number(compatibilidad.year_to);
          if (!Number.isFinite(anioDesde) || !Number.isFinite(anioHasta) || anioDesde > anioHasta) {
            hayDatosInsuficientes = true;
            continue;
          }
          if (anioSeleccionado >= anioDesde && anioSeleccionado <= anioHasta) return true;
        }

        return hayDatosInsuficientes ? null : false;
      })()
    : null;

  // El agregado lo hace BotonAgregarCarrito y el aviso, CartContext.
  const sinStock = productoActual.stock === 0;

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      {navbar}

      <main>
        <EncabezadoPagina
          ancho="max-w-[1200px]"
          migas={[
            { texto: "Inicio", ir: onHome },
            { texto: "Repuestos", ir: () => onCatalogo(null) },
            ...(productoActual.categoria
              ? [{ texto: productoActual.categoria, ir: () => onCatalogo(productoActual.categoria) }]
              : []),
            productoActual.nombre,
          ]}
          titulo={productoActual.nombre}
          descripcion={productoActual.fabricante}
          fin={
              <div id="vehicle-selection" data-testid="vehicle-selection"
                data-compatibilidad={compatibilidades.length === 0 ? "no-disponible" : !marcaSeleccionada ? "sin-vehiculo" : compatible === null ? "no-verificable" : compatible ? "compatible" : "incompatible"}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-orange-400"><IconoAuto className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">Tu vehículo</p>
                    <p className="truncate text-xs font-bold text-white">
                      {filtrosVehiculo?.brand
                        ? [filtrosVehiculo.brand, filtrosVehiculo.model, filtrosVehiculo.year].filter(Boolean).join(" ")
                        : "Seleccioná tu vehículo"}
                    </p>
                  </div>
                  {!editandoVehiculo && (
                    <button type="button" onClick={abrirSelectorVehiculo}
                      className="shrink-0 text-[11px] font-bold text-orange-400 underline underline-offset-4 hover:text-orange-300">
                      {filtrosVehiculo?.brand ? "Cambiar" : "Seleccionar vehículo"}
                    </button>
                  )}
                </div>
                <div aria-hidden={!editandoVehiculo}
                  inert={!editandoVehiculo}
                  onTransitionEnd={finalizarTransicionSelector}
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none motion-reduce:duration-0 ${editandoVehiculo ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="min-h-0 overflow-hidden">
                  {selectorVehiculoMontado && (
                    <div id="vehicle-selector-panel" role="group" aria-label="Controles del vehículo" className="border-t border-white/10 pt-3">
                      <VehicleSelector
                        key={[filtrosVehiculo?.brand || "", filtrosVehiculo?.model || "", filtrosVehiculo?.year || ""].join("|")}
                        vehicle={filtrosVehiculo}
                        requireComplete={false}
                        variant="compact"
                        confirmLabel="Confirmar"
                        onConfirm={(vehiculo) => {
                          activarVehiculo(vehiculo);
                          cerrarSelectorVehiculo();
                        }}
                        onCancel={cerrarSelectorVehiculo}
                      />
                    </div>
                  )}
                  </div>
                </div>
              </div>
          }
        />

        <section className="bg-gray-50 py-7 md:py-9">
          <div className="max-w-[1200px] mx-auto px-5 md:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr_0.7fr] gap-7">
            <div>
              <div className="relative h-[360px] bg-white rounded-xl overflow-hidden border border-gray-100">
                <img src={imagenes[imagenActiva] ?? imagenes[0]} alt={productoActual.nombre} className="w-full h-full object-contain p-6" />
                <button onClick={() => onAlternarFavorito(productoActual)}
                  className={`absolute top-4 right-4 flex w-10 h-10 items-center justify-center bg-white rounded-full shadow-md ${favorito ? "text-orange-500" : "text-gray-500"}`}>
                  <IconoCorazon className="h-5 w-5" relleno={favorito} />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">Imagen ilustrativa.</p>
              {imagenes.length > 1 && (
                <div className="flex items-center gap-3 mt-3">
                  {imagenes.map((imagen, index) => (
                    <button key={imagen} onClick={() => setImagenActiva(index)}
                      aria-label={`Ver imagen ${index + 1}`}
                      className={`w-[70px] h-[58px] rounded-md overflow-hidden border-2 ${imagenActiva === index ? "border-orange-500" : "border-gray-200"}`}>
                      <img src={imagen} alt="" className="w-full h-full object-contain bg-white p-1" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              {/* El fabricante y el nombre se presentan en el encabezado. */}
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-bold text-gray-500">Código: <span className="font-black text-gray-800">{productoActual.codigo}</span></p>
                <div className="mt-5 border-t border-gray-100 pt-5">
                  <h2 className="text-sm font-black text-gray-900">Descripción</h2>
                  <p className="mt-2 text-xs leading-relaxed text-gray-600">
                    {productoActual.descripcion || "Este repuesto todavía no tiene una descripción cargada."}
                  </p>
                </div>
                <div className="mt-5 border-t border-gray-100 pt-5">
                  <h2 className="text-sm font-black text-gray-900">Especificaciones</h2>
                  {!productoActual.especificaciones?.length && (
                    <p className="mt-3 text-xs text-gray-400">Este repuesto no tiene especificaciones cargadas.</p>
                  )}
                  <div className="mt-3 space-y-2">
                    {(productoActual.especificaciones || []).map(([clave, valor]) => (
                      <div key={clave} className="flex justify-between gap-4 border-b border-gray-100 pb-2 text-xs">
                        <span className="text-gray-500">{clave}</span>
                        <span className="text-right font-bold text-gray-800">{valor}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div data-testid="warranty-details" className="mt-5 border-t border-gray-100 pt-5">
                  <h2 className="text-sm font-black text-gray-900">Garantía</h2>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500">Duración</dt>
                      <dd className="text-right font-bold text-orange-600">
                        {productoActual.garantiaMeses ? `${productoActual.garantiaMeses} meses` : "No especificado"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500">Proveedor</dt>
                      <dd className="text-right font-bold text-gray-800">
                        {productoActual.proveedorGarantia
                          ? productoActual.proveedorGarantia === "fabricante"
                            ? "Fabricante"
                            : productoActual.proveedorGarantia === "vendedor"
                              ? "Vendedor (AutoBought)"
                              : productoActual.proveedorGarantia
                          : "No especificado"}
                      </dd>
                    </div>
                    {productoActual.condicionesGarantia && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500">Condiciones</dt>
                        <dd className="max-w-[70%] text-right font-bold text-gray-800">{productoActual.condicionesGarantia}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

            </div>

            <div>
              <div className="h-fit rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-3xl font-black text-orange-500">${productoActual.precio.toLocaleString("es-UY")}</p>
                {sinStock ? (
                  <p className="mt-2 text-xs">
                    <span className="font-bold text-red-500">Sin stock</span>
                    <BotonAvisoStock producto={productoActual} tieneAviso={tieneAvisoStock(productoActual.partId)} onAlternarAviso={onAlternarAvisoStock} className="ml-3 text-[10px]" />
                  </p>
                ) : (
                  <p className="mt-2 text-xs"><span className="font-bold text-green-600">En stock</span><span className="ml-2 text-gray-400">({productoActual.stock} unidades)</span></p>
                )}
                <div className="mt-5 flex flex-col gap-2 xl:flex-row">
                  <div className="flex h-10 shrink-0 items-center rounded-md border border-gray-200">
                    <button aria-label="Disminuir cantidad" onClick={() => setCantidad((v) => Math.max(1, v - 1))} disabled={sinStock} className="w-9 disabled:opacity-40">−</button>
                    <span className="flex w-8 items-center justify-center text-xs">{sinStock ? 0 : cantidad}</span>
                    <button aria-label="Aumentar cantidad" onClick={() => setCantidad((v) => Math.min(productoActual.stock, v + 1))} disabled={sinStock || cantidad >= productoActual.stock} className="w-9 disabled:opacity-40">+</button>
                  </div>
                  <BotonAgregarCarrito
                    producto={productoActual}
                    cantidad={cantidad}
                    textoSinStock="SIN STOCK"
                    onTerminar={() => setCantidad(1)}
                    className="h-10 min-w-0 flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 text-[10px] font-black"
                  >
                    <IconoCarrito className="h-3.5 w-3.5" />AGREGAR AL CARRITO
                  </BotonAgregarCarrito>
                </div>
                <button onClick={() => onAlternarFavorito(productoActual)}
                  className={`mt-3 h-10 w-full rounded-md border text-[10px] font-bold ${favorito ? "border-orange-500 text-orange-500" : "border-gray-200 text-gray-600"}`}>
                  <span className="inline-flex items-center justify-center gap-1.5"><IconoCorazon className="h-3.5 w-3.5" relleno={favorito} />{favorito ? "Agregado a favoritos" : "Agregar a favoritos"}</span>
                </button>
              </div>
              <div data-testid="compatibility-card" className="mt-3 min-w-0 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="text-sm font-black text-gray-900">Compatibilidad</h2>
                {!marcaSeleccionada && compatibilidades.length > 0 && (
                  <p className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold leading-tight text-gray-700">
                    Elegí tu vehículo para verificar la compatibilidad
                  </p>
                )}
                {compatible !== null && compatibilidades.length > 0 && (
                  <p className={`mt-3 w-full rounded-lg border px-3 py-2 text-xs font-semibold leading-tight ${compatible ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                    {compatible ? "Compatible con tu vehículo" : `No es compatible con tu ${nombreVehiculo}`}
                  </p>
                )}
                {!compatibilidades.length && <p className="mt-3 text-xs text-gray-600">La información de compatibilidad no está disponible.</p>}
                {compatibilidades.length > 0 && (
                  <div className="mt-3 min-w-0 space-y-2">
                    {compatibilidades.map((item, index) => {
                      if (item.formatoTexto) {
                        const texto = item.texto;
                        const aniosEncontrados = texto.match(/\b(?:19|20)\d{2}\b/g) || [];
                        const anioIndex = texto.search(/\b(?:19|20)\d{2}\b/);
                        const motorEncontrado = texto.match(/\b\d(?:[.,]\d)?(?:\s?(?:8V|16V|MSI|TSI|TDI|HDI|VTI|MPI))?\b/i);
                        const cortesNombre = [anioIndex, motorEncontrado?.index].filter((index) => index != null && index >= 0);
                        const corteNombre = cortesNombre.length ? Math.min(...cortesNombre) : texto.length;
                        const nombreAuto = texto.slice(0, corteNombre).replace(/\s+/g, " ").trim() || texto.trim();
                        return <div key={`${item.texto}-${index}`} className="rounded-lg border border-gray-200 px-3 py-2">
                          <p className="text-xs font-black text-gray-900">{nombreAuto}</p>
                          {(motorEncontrado || aniosEncontrados.length > 0) && (
                            <p className="mt-1 text-[10px] leading-relaxed text-gray-600">
                              {motorEncontrado && <>Motor: {motorEncontrado[0].trim()}</>}
                              {motorEncontrado && aniosEncontrados.length > 0 && " · "}
                              {aniosEncontrados.length === 1 && <>Año: {aniosEncontrados[0]}</>}
                              {aniosEncontrados.length > 1 && <>Años: {aniosEncontrados[0]}–{aniosEncontrados[aniosEncontrados.length - 1]}</>}
                            </p>
                          )}
                        </div>;
                      }
                      const years = item.year_from != null && item.year_to != null
                        ? item.year_from === item.year_to ? `Año: ${item.year_from}` : `Años: ${item.year_from}–${item.year_to}`
                        : item.year_from != null ? `Desde ${item.year_from}` : item.year_to != null ? `Hasta ${item.year_to}` : null;
                      return <div key={`${item.brand}-${item.model}-${index}`} className="min-w-0 rounded-lg border border-gray-200 px-3 py-2">
                        <p className="text-xs font-black text-gray-900">{[item.brand, item.model].filter(Boolean).join(" ") || "Vehículo sin identificar"}</p>
                        {(item.engine_code || years) && (
                          <p className="mt-1 text-[10px] leading-relaxed text-gray-600">
                            {item.engine_code && <>Motor: {item.engine_code}</>}
                            {item.engine_code && years && " · "}
                            {years}
                          </p>
                        )}
                      </div>;
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>
        </section>

      </main>
    </div>
  );
}
