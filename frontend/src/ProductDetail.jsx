// Pantalla del detalle de un repuesto.

import { useEffect, useState } from "react";
import { useGenericImage } from "./mapPart";
import Navbar from "./Navbar";
import PageHeader from "./PageHeader";
import { useParams } from "react-router-dom";
import AddToCartButton from "./AddToCartButton";
import StockAlertButton from "./StockAlertButton";
import BoughtTogether from "./BoughtTogether";
import { useVehicle } from "./context/VehicleContext";
import VehicleSelector from "./VehicleSelector";
import { CarIcon } from "./Icons";
import { getPart } from "./api";
import { extractProductId } from "./productSlug";
import { isSeller } from "./auth";
import { compatibilitiesOf, isCompatible, normalizeText } from "./compatibility";

function CartIcon({ className = "h-4 w-4" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="9" cy="20" r="1" />
      <circle cx="19" cy="20" r="1" />
      <path d="M2 3h2l2.6 12.2a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L22 7H5" />
    </svg>
  );
}

function HeartIcon({ className = "h-5 w-5", relleno = false }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill={relleno ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    </svg>
  );
}

// Cuántos autos compatibles se ven antes de "Ver los N autos compatibles".
const VISIBLE_COMPATIBLES = 6;

export default function ProductDetail({
  onHome,
  onLogin,
  onBrands,
  onCatalogo,
  onCart,
  onFavorites,
  favoritesQuantity,
  product,
  onDetail,
  onToggleFavorite,
  isFavorite,
  onToggleNoticeStock,
  hasNoticeStock = () => false,
  sessionUser,
  onProfile,
  onAddresses,
  onHistory,
  onCloseSession,
  onDeleteAccount,
}) {
  const { activeVehicle: filtersVehicle, activateVehicle } = useVehicle();
  // El vendedor no compra: no ve carrito, favoritos ni avisos de stock.
  const seller = isSeller(sessionUser);
  const { id: slugFromUrl } = useParams();
  const idFromUrl = extractProductId(slugFromUrl);
  const [loadedDetail, setLoadedDetail] = useState({ id: null, estado: "loading", product: null });
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [editingVehicle, setEditingVehicle] = useState(false);
  const [selectorVehicleMounted, setSelectorVehicleMounted] = useState(false);
  const [seeAllCompatibles, setSeeAllCompatibles] = useState(false);

  useEffect(() => {
    if (!idFromUrl) return;

    let vigente = true;
    setLoadedDetail({ id: idFromUrl, estado: "loading", product: null });
    getPart(idFromUrl)
      .then((part) => {
        if (vigente) {
          setLoadedDetail({ id: idFromUrl, estado: "ready", product: part });
        }
      })
      .catch((error) => {
        if (vigente) {
          setLoadedDetail({
            id: idFromUrl,
            estado: error.status === 404 ? "no-encontrado" : "error",
            product: null,
          });
        }
      });

    return () => {
      vigente = false;
    };
  }, [idFromUrl]);

  const loadStatus = idFromUrl
    ? loadedDetail.id === idFromUrl ? loadedDetail.estado : "loading"
    : product ? "ready" : "no-encontrado";
  const currentProduct = idFromUrl
    ? loadedDetail.id === idFromUrl && loadedDetail.estado === "ready"
      ? loadedDetail.product
      : null
    : product;

  const navbar = (
    <Navbar currentPage="detalle" onHome={onHome} onCatalogo={onCatalogo} onLogin={onLogin}
      onBrands={onBrands} onCart={onCart} onFavorites={onFavorites}
      sessionUser={sessionUser} onProfile={onProfile} onAddresses={onAddresses}
      onHistory={onHistory} onCloseSession={onCloseSession} onDeleteAccount={onDeleteAccount}
      favoritesQuantity={favoritesQuantity} />
  );

  if (loadStatus !== "ready" || !currentProduct) {
    const message = loadStatus === "loading"
      ? "Cargando"
      : loadStatus === "no-encontrado"
        ? "Repuesto no encontrado"
        : "No se pudo cargar el repuesto.";
    return (
      <div className="min-h-screen bg-white text-gray-900 font-sans">
        {navbar}
        <main className="mx-auto max-w-[1200px] px-5 pt-36 md:px-10">
          <p role={loadStatus === "loading" ? "status" : "alert"} className="text-sm text-gray-700">{message}</p>
        </main>
      </div>
    );
  }
  const favorite = isFavorite(currentProduct.id);
  // Cada repuesto tiene una sola imagen (la de su tipo y fabricante). Las
  // miniaturas se muestran solo si hay más de una vista distinta: repetir
  // la misma foto tres veces no aporta nada.
  const images = [...new Set([currentProduct.image, ...(currentProduct.imagesExtra ?? [])].filter(Boolean))];
  const openSelectorVehicle = () => {
    setSelectorVehicleMounted(true);
    setEditingVehicle(true);
  };
  const closeSelectorVehicle = () => {
    setEditingVehicle(false);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setSelectorVehicleMounted(false);
    }
  };
  const finishTransitionSelector = (event) => {
    if (event.target === event.currentTarget && !editingVehicle) {
      setSelectorVehicleMounted(false);
    }
  };

  const selectedBrand = normalizeText(filtersVehicle?.brand);
  const vehicleName = [filtersVehicle?.brand, filtersVehicle?.model, filtersVehicle?.year].filter(Boolean).join(" ");
  // La regla de compatibilidad vive en compatibilidad.js (la comparte con
  // "Suelen comprarse juntos").
  const compatibilidades = compatibilitiesOf(currentProduct);
  const compatible = isCompatible(compatibilidades, filtersVehicle);

  // El agregado lo hace BotonAgregarCarrito y el aviso, CartContext.
  const withoutStock = currentProduct.stock === 0;


  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      {navbar}

      <main>
        <PageHeader
          ancho="max-w-[1200px]"
          migas={[
            { texto: "Inicio", goTo: onHome },
            { texto: "Repuestos", goTo: () => onCatalogo(null) },
            ...(currentProduct.categoria
              ? [{ texto: currentProduct.categoria, goTo: () => onCatalogo(currentProduct.categoria) }]
              : []),
            currentProduct.displayName,
          ]}
          title={currentProduct.categoria || "Repuestos"}
          titleLabel="p"
          compact
          fin={
              <div id="vehicle-selection" data-testid="vehicle-selection"
                data-compatibilidad={compatibilidades.length === 0 ? "no-disponible" : !selectedBrand ? "sin-vehiculo" : compatible === null ? "no-verificable" : compatible ? "compatible" : "incompatible"}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-orange-400"><CarIcon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Tu vehículo</p>
                    <p className="truncate text-xs font-bold text-white">
                      {filtersVehicle?.brand
                        ? [filtersVehicle.brand, filtersVehicle.model, filtersVehicle.year].filter(Boolean).join(" ")
                        : "Seleccioná tu vehículo"}
                    </p>
                  </div>
                  {!editingVehicle && (
                    <button type="button" onClick={openSelectorVehicle}
                      className="shrink-0 text-xs font-bold text-orange-400 underline underline-offset-4 hover:text-orange-300">
                      {filtersVehicle?.brand ? "Cambiar" : "Seleccionar vehículo"}
                    </button>
                  )}
                </div>
                <div aria-hidden={!editingVehicle}
                  inert={!editingVehicle}
                  onTransitionEnd={finishTransitionSelector}
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none motion-reduce:duration-0 ${editingVehicle ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="min-h-0 overflow-hidden">
                  {selectorVehicleMounted && (
                    <div id="vehicle-selector-panel" role="group" aria-label="Controles del vehículo" className="border-t border-white/10 pt-3">
                      <VehicleSelector
                        key={[filtersVehicle?.brand || "", filtersVehicle?.model || "", filtersVehicle?.year || ""].join("|")}
                        vehicle={filtersVehicle}
                        requireComplete={false}
                        variant="compact"
                        confirmLabel="Confirmar"
                        onConfirm={(vehicle) => {
                          activateVehicle(vehicle);
                          closeSelectorVehicle();
                        }}
                        onCancel={closeSelectorVehicle}
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
          {/* En celular: foto, nombre, precio y compra, y recién después
              los detalles (antes había que pasar toda la descripción para
              llegar al precio). En pantallas grandes, tres columnas. */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr_0.7fr] lg:grid-rows-[auto_1fr] gap-x-7 gap-y-5">
            <div className="order-1 lg:col-start-1 lg:row-start-1 lg:row-span-2">
              {/* El favorito va una sola vez: en el botón debajo de
                  "Agregar al carrito", no también sobre la foto. */}
              <div className="relative h-[360px] bg-white rounded-xl overflow-hidden border border-gray-100">
                <img onError={useGenericImage} src={images[activeImage] ?? images[0]} alt={currentProduct.displayName} className="w-full h-full object-contain p-6" />
              </div>
              <p className="text-xs text-gray-400 mt-2">Imagen ilustrativa.</p>
              {images.length > 1 && (
                <div className="flex items-center gap-3 mt-3">
                  {images.map((image, index) => (
                    <button key={image} onClick={() => setActiveImage(index)}
                      aria-label={`Ver imagen ${index + 1}`}
                      className={`w-[70px] h-[58px] rounded-md overflow-hidden border-2 ${activeImage === index ? "border-orange-500" : "border-gray-200"}`}>
                      <img onError={useGenericImage} src={image} alt="" className="w-full h-full object-contain bg-white p-1" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="order-2 lg:col-start-2 lg:row-start-1">
              {/* El fabricante y el nombre, al lado de la foto y en tamaño
                  normal (como en cualquier tienda): en la franja de arriba
                  los nombres largos se leían mal. */}
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-wide text-orange-500">{currentProduct.fabricante}</p>
                <h1 className="mt-1 text-2xl font-black leading-tight text-gray-900">{currentProduct.displayName}</h1>
                <p className="mt-2 text-xs font-bold text-gray-500">Código: <span className="font-black text-gray-800">{currentProduct.code}</span></p>
              </div>
            </div>

            <div className="order-4 lg:col-start-2 lg:row-start-2">
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div>
                  <h2 className="text-sm font-black text-gray-900">Descripción</h2>
                  <p className="mt-2 text-xs leading-relaxed text-gray-600">
                    {currentProduct.description || "Este repuesto todavía no tiene una descripción cargada."}
                  </p>
                </div>
                <div className="mt-5 border-t border-gray-100 pt-5">
                  <h2 className="text-sm font-black text-gray-900">Especificaciones</h2>
                  {!currentProduct.specifications?.length && (
                    <p className="mt-3 text-xs text-gray-400">Este repuesto no tiene especificaciones cargadas.</p>
                  )}
                  <div className="mt-3 space-y-2">
                    {(currentProduct.specifications || []).map(([key, rawValue]) => (
                      <div key={key} className="flex justify-between gap-4 border-b border-gray-100 pb-2 text-xs">
                        <span className="text-gray-500">{key}</span>
                        <span className="text-right font-bold text-gray-800">{rawValue}</span>
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
                        {currentProduct.monthsWarranty ? `${currentProduct.monthsWarranty} meses` : "No especificado"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500">Proveedor</dt>
                      <dd className="text-right font-bold text-gray-800">
                        {currentProduct.warrantyProvider
                          ? currentProduct.warrantyProvider === "fabricante"
                            ? "Fabricante"
                            : currentProduct.warrantyProvider === "vendedor"
                              ? "Vendedor (AutoBought)"
                              : currentProduct.warrantyProvider
                          : "No especificado"}
                      </dd>
                    </div>
                    {currentProduct.condicionesWarranty && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500">Condiciones</dt>
                        <dd className="max-w-[70%] text-right font-bold text-gray-800">{currentProduct.condicionesWarranty}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

            </div>

            <div className="order-3 lg:col-start-3 lg:row-start-1 lg:row-span-2">
              <div className="h-fit rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-3xl font-black text-orange-500">${currentProduct.price.toLocaleString("es-UY")}</p>
                {withoutStock ? (
                  <p className="mt-2 text-xs">
                    <span className="font-bold text-red-500">Sin stock</span>
                    {!seller && (
                      <StockAlertButton product={currentProduct} hasNotice={hasNoticeStock(currentProduct.partId)} onToggleNotice={onToggleNoticeStock} className="ml-3 text-xs" />
                    )}
                  </p>
                ) : (
                  <p className="mt-2 text-xs"><span className="font-bold text-green-600">En stock</span><span className="ml-2 text-gray-400">({currentProduct.stock} unidades)</span></p>
                )}
                {!seller && (
                <>
                <div className="mt-5 flex flex-col gap-2 xl:flex-row">
                  <div className="flex h-10 shrink-0 items-center rounded-md border border-gray-200">
                    <button aria-label="Disminuir cantidad" onClick={() => setQuantity((v) => Math.max(1, v - 1))} disabled={withoutStock} className="w-9 disabled:opacity-40">−</button>
                    <span className="flex w-8 items-center justify-center text-xs">{withoutStock ? 0 : quantity}</span>
                    <button aria-label="Aumentar cantidad" onClick={() => setQuantity((v) => Math.min(currentProduct.stock, v + 1))} disabled={withoutStock || quantity >= currentProduct.stock} className="w-9 disabled:opacity-40">+</button>
                  </div>
                  <AddToCartButton
                    product={currentProduct}
                    quantity={quantity}
                    textWithoutStock="Sin stock"
                    onTerminar={() => setQuantity(1)}
                    className="h-10 min-w-0 flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 text-sm font-bold whitespace-nowrap"
                  >
                    <CartIcon className="h-4 w-4" />Agregar al carrito
                  </AddToCartButton>
                </div>
                <button onClick={() => onToggleFavorite(currentProduct)}
                  className={`mt-3 h-10 w-full rounded-md border text-sm font-bold transition ${favorite ? "border-orange-500 text-orange-500" : "border-gray-200 text-gray-600 hover:border-orange-500 hover:text-orange-500"}`}>
                  <span className="inline-flex items-center justify-center gap-1.5"><HeartIcon className="h-4 w-4" relleno={favorite} />{favorite ? "Guardado en favoritos" : "Agregar a favoritos"}</span>
                </button>
                </>
                )}
              </div>
              <div data-testid="compatibility-card" className="mt-3 min-w-0 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="text-sm font-black text-gray-900">Compatibilidad</h2>
                {!selectedBrand && compatibilidades.length > 0 && (
                  <p className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold leading-tight text-gray-700">
                    Elegí tu vehículo para verificar la compatibilidad
                  </p>
                )}
                {compatible !== null && compatibilidades.length > 0 && (
                  <p className={`mt-3 w-full rounded-lg border px-3 py-2 text-xs font-semibold leading-tight ${compatible ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                    {compatible ? "Compatible con tu vehículo" : `No es compatible con tu ${vehicleName}`}
                  </p>
                )}
                {!compatibilidades.length && <p className="mt-3 text-xs text-gray-600">La información de compatibilidad no está disponible.</p>}
                {compatibilidades.length > 0 && (
                  <div className="mt-3 min-w-0 space-y-2">
                    {/* Un repuesto genérico (un aceite) le sirve a decenas de
                        autos: se ven los primeros y el resto, a pedido. */}
                    {(seeAllCompatibles ? compatibilidades : compatibilidades.slice(0, VISIBLE_COMPATIBLES)).map((item, index) => {
                      if (item.formatText) {
                        const texto = item.texto;
                        const foundYears = texto.match(/\b(?:19|20)\d{2}\b/g) || [];
                        const yearIndex = texto.search(/\b(?:19|20)\d{2}\b/);
                        const engineFound = texto.match(/\b\d(?:[.,]\d)?(?:\s?(?:8V|16V|MSI|TSI|TDI|HDI|VTI|MPI))?\b/i);
                        const cutsName = [yearIndex, engineFound?.index].filter((index) => index != null && index >= 0);
                        const cutName = cutsName.length ? Math.min(...cutsName) : texto.length;
                        const nameCar = texto.slice(0, cutName).replace(/\s+/g, " ").trim() || texto.trim();
                        return <div key={`${item.texto}-${index}`} className="rounded-lg border border-gray-200 px-3 py-2">
                          <p className="text-xs font-black text-gray-900">{nameCar}</p>
                          {(engineFound || foundYears.length > 0) && (
                            <p className="mt-1 text-xs leading-relaxed text-gray-600">
                              {engineFound && <>Motor: {engineFound[0].trim()}</>}
                              {engineFound && foundYears.length > 0 && " · "}
                              {foundYears.length === 1 && <>Año: {foundYears[0]}</>}
                              {foundYears.length > 1 && <>Años: {foundYears[0]}–{foundYears[foundYears.length - 1]}</>}
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
                          <p className="mt-1 text-xs leading-relaxed text-gray-600">
                            {item.engine_code && <>Motor: {item.engine_code}</>}
                            {item.engine_code && years && " · "}
                            {years}
                          </p>
                        )}
                      </div>;
                    })}
                    {compatibilidades.length > VISIBLE_COMPATIBLES && (
                      <button
                        type="button"
                        onClick={() => setSeeAllCompatibles((see) => !see)}
                        aria-expanded={seeAllCompatibles}
                        className="w-full pt-1 text-xs font-bold text-orange-600 hover:underline underline-offset-4"
                      >
                        {seeAllCompatibles ? "Ver menos" : `Ver los ${compatibilidades.length} autos compatibles`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>
        </section>

        <BoughtTogether product={currentProduct} onDetail={onDetail} seller={seller} />

      </main>
    </div>
  );
}
