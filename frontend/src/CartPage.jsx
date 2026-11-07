// Pantalla del carrito y la confirmación de la compra.

import { useState } from "react";
import { useGenericImage } from "./mapPart";
import Navbar from "./Navbar";
import { confirmPurchase, createPaymentLink, getAddresses } from "./api";
import { useCart } from "./context/CartContext";
import CartSuggestions from "./CartSuggestions";
import PageHeader from "./PageHeader";
import { TrashIcon, LockIcon, CartIcon } from "./Icons";
import { paymentDeadlineText } from "./paymentDeadline";
import { goTo } from "./redirect";


export default function CartPage({
  onHome, onCatalogo, onLogin, onBrands, onCart, onFavorites,
  favoritesQuantity, onDetail, onAddresses,
  sessionUser, onProfile, onHistory, onOrders, onCloseSession,
}) {
  const { cart: products, updateQuantity, removeFromCart, clearCart, total, loadCart } = useCart();

  const subtotal = total;
  const shipping = products.length ? 0 : 0;
  const totalFinal = subtotal + shipping;

  const price = (rawValue) => `$${rawValue.toLocaleString("es-UY")}`;
  const units = products.reduce((sum, p) => sum + p.quantity, 0);

  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [pedido, setOrder] = useState(null);
  const [purchaseError, setPurchaseError] = useState("");
  const [addresses, setAddresses] = useState([]);
  const [idAddress, setIdAddress] = useState("");
  const [loadingData, setLoadingData] = useState(false);

  // La principal, o la primera.
  const primaryId = (list) => {
    const primary = list.find((item) => item.primary) ?? list[0];
    return primary ? String(primary.id) : "";
  };

  // Al abrir se traen las direcciones del perfil, con la principal
  // preseleccionada.
  const openConfirmation = async () => {
    setOrder(null);
    setPurchaseError("");
    setConfirmationOpen(true);
    setLoadingData(true);
    try {
      const addressesList = await getAddresses();
      setAddresses(addressesList);
      setIdAddress(primaryId(addressesList));
    } catch (error) {
      setPurchaseError(error.message || "No pudimos cargar tus direcciones.");
    } finally {
      setLoadingData(false);
    }
  };

  const addressText = (d) =>
    `${d.street} ${d.number}${d.apartamento ? ` apto ${d.apartamento}` : ""}, ${d.city}`;
  const canConfirm = !sending && !loadingData && idAddress !== "";

  const closeConfirmation = () => {
    if (sending) return;
    setConfirmationOpen(false);
  };

  // Lleva al cliente a pagar el pedido en Mercado Pago. Si no se puede
  // abrir, el pedido ya quedó creado (con el stock reservado): se muestra
  // el error y se puede reintentar sin volver a confirmar.
  const goToPay = async (orderToPay) => {
    setSending(true);
    setPurchaseError("");
    try {
      goTo(await createPaymentLink(orderToPay.id));
    } catch (error) {
      setPurchaseError(error.message || "No pudimos abrir Mercado Pago.");
      setSending(false);
    }
  };

  // Se crea el pedido (pendiente de pago) y se va a pagar. Si falla, el
  // mensaje ya viene en español desde el backend: en el 409 dice qué
  // repuesto no alcanza.
  const confirm = async () => {
    setSending(true);
    setPurchaseError("");
    let newOrder;
    try {
      newOrder = await confirmPurchase({ idAddress: Number(idAddress) });
    } catch (error) {
      setPurchaseError(error.message || "No pudimos confirmar la compra.");
      setSending(false);
      return;
    }
    setOrder(newOrder);
    // El carrito ya quedó vacío en el backend.
    loadCart();
    await goToPay(newOrder);
  };

  const summary = (
    <aside className="bg-white border border-gray-200 rounded-xl p-5 h-fit shadow-xs lg:sticky lg:top-24">
      <h2 className="text-base font-black">Resumen del pedido</h2>
      <div className="mt-5 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">
            Subtotal ({units} {units === 1 ? "unidad" : "unidades"})
          </span>
          <span className="font-bold">{price(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm"><span className="text-gray-500">Envío</span><span className="text-green-600 font-bold">Gratis</span></div>
      </div>
      <div className="border-t border-gray-200 mt-5 pt-4 flex justify-between items-end">
        <span className="text-sm font-bold">Total</span>
        <span className="text-2xl font-black text-orange-500">{price(totalFinal)}</span>
      </div>
      <button onClick={openConfirmation} disabled={products.length === 0}
        className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-md h-12 mt-5 text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-orange-500">
        Finalizar compra
      </button>
      <button type="button" onClick={() => onCatalogo()}
        className="w-full mt-2 h-10 text-sm font-bold text-gray-600 hover:text-orange-500 transition">
        Seguir comprando
      </button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-2 pt-3 border-t border-gray-100">
        <LockIcon className="w-3.5 h-3.5" />
        Pago 100% seguro y protegido
      </p>

      {confirmationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5">
          <div role="dialog" aria-modal="true" aria-labelledby="titulo-confirmar-compra"
            className="w-full max-w-[420px] bg-white rounded-xl p-6 shadow-lg">
            {pedido ? (
              <div className="text-center">
                <h2 id="titulo-confirmar-compra" className="text-lg font-black">{`Pedido #${pedido.id}`}</h2>
                {purchaseError ? (
                  <>
                    <p role="alert" className="text-sm text-red-600 font-bold mt-2">{purchaseError}</p>
                    <p className="text-sm text-gray-500 mt-2">
                      {pedido.expiresPayment
                        ? `Tus repuestos quedan reservados hasta ${paymentDeadlineText(pedido.expiresPayment)}.`
                        : "Tus repuestos quedan reservados mientras pagás."}
                    </p>
                    <button onClick={() => goToPay(pedido)} disabled={sending}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-md py-3 mt-6 text-sm font-black disabled:opacity-40">
                      Reintentar pago
                    </button>
                    <button onClick={onOrders} disabled={sending}
                      className="w-full mt-2 py-2 text-sm font-bold text-gray-500 hover:text-orange-500 disabled:opacity-40">
                      Pagar más tarde desde mis compras
                    </button>
                  </>
                ) : (
                  <p role="status" className="text-sm text-gray-500 mt-2">Te llevamos a Mercado Pago para pagar...</p>
                )}
              </div>
            ) : (
              <>
                <h2 id="titulo-confirmar-compra" className="text-lg font-black">Confirmá tu compra</h2>
                <ul className="mt-4 space-y-2 max-h-[240px] overflow-y-auto">
                  {products.map((product) => (
                    <li key={product.id} className="flex justify-between gap-3 text-sm">
                      <span>{product.displayName} × {product.quantity}</span>
                      <span className="font-bold whitespace-nowrap">{price(product.price * product.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-gray-200 mt-4 pt-4 flex justify-between items-end">
                  <span className="text-xs text-gray-400">TOTAL</span>
                  <span className="text-xl font-black text-orange-500">{price(totalFinal)}</span>
                </div>
                {loadingData ? (
                  <p role="status" className="mt-4 text-sm text-gray-500">Cargando tus direcciones...</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label htmlFor="direccion-envio" className="block text-xs font-black text-gray-500">DIRECCIÓN DE ENVÍO</label>
                      {addresses.length > 0 ? (
                        <select id="direccion-envio" value={idAddress} onChange={(e) => setIdAddress(e.target.value)}
                          className="w-full mt-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-white outline-hidden focus:border-orange-500">
                          {addresses.map((d) => (
                            <option key={d.id} value={String(d.id)}>{addressText(d)}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="mt-1 text-sm text-gray-500">
                          No tenés direcciones guardadas.{" "}
                          <button type="button" onClick={onAddresses} className="text-orange-500 font-bold hover:underline">
                            Agregar una dirección
                          </button>
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <p className="mt-4 text-xs text-gray-500">
                  Vas a pagar en Mercado Pago: la tarjeta se carga ahí, no en la tienda.
                </p>
                {purchaseError && (
                  <p role="alert" className="mt-4 text-sm text-red-600 font-bold">{purchaseError}</p>
                )}
                <div className="mt-6 flex gap-3">
                  <button onClick={closeConfirmation} disabled={sending}
                    className="flex-1 border border-gray-200 rounded-md py-3 text-sm font-black text-gray-500 hover:border-orange-500 hover:text-orange-500 disabled:opacity-40">
                    Cancelar
                  </button>
                  <button onClick={confirm} disabled={!canConfirm}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-md py-3 text-sm font-black disabled:opacity-40">
                    {sending ? "Confirmando..." : "Ir a pagar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <Navbar currentPage="cartState" onHome={onHome} onCatalogo={onCatalogo} onLogin={onLogin}
        onBrands={onBrands} onCart={onCart} onFavorites={onFavorites}
        sessionUser={sessionUser} onProfile={onProfile} onAddresses={onAddresses}
        onHistory={onHistory} onCloseSession={onCloseSession}
        favoritesQuantity={favoritesQuantity} />

      <main>
        <PageHeader
          migas={[{ texto: "Inicio", goTo: onHome }, "Carrito"]}
          title="Tu Carrito de Compras"
          description="Revisá tus repuestos antes de pagar."
        />

        <div className="px-5 md:px-10 py-8">
          <div className="max-w-[1100px] mx-auto">

            {products.length === 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
                <div className="bg-white border border-gray-200 rounded-xl px-8 py-12 text-center shadow-xs">
                  <span className="mx-auto mb-4 w-16 h-16 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center">
                    <CartIcon className="w-8 h-8" />
                  </span>
                  <h2 className="text-xl font-black">Tu carrito está vacío</h2>
                  <p className="text-sm text-gray-400 mt-2">Agregá repuestos desde el catálogo para verlos acá.</p>
                  <button onClick={() => onCatalogo()}
                    className="mt-6 bg-orange-500 hover:bg-orange-600 text-white px-7 py-3 rounded-md text-sm font-black">
                    Ver repuestos
                  </button>
                </div>
                {summary}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
                <div className="min-w-0">

                  {/* LISTA: una sola tarjeta, una fila compacta por
                      producto, para que con muchos no se haga eterna. */}

                  <section className="bg-white border border-gray-200 rounded-xl shadow-xs">

                    <div className="flex justify-between items-center px-5 py-3 border-b border-gray-200">
                      <h2 className="text-base font-black">
                        Productos <span className="text-gray-400 font-bold">({products.length})</span>
                      </h2>
                      <button onClick={clearCart}
                        className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-red-500 transition">
                        <TrashIcon className="w-4 h-4" />
                        Vaciar carrito
                      </button>
                    </div>

                    <ul className="divide-y divide-gray-100">
                      {products.map((product) => {
                        const alcanzoMaximo = product.quantity >= product.stock;
                        return (
                          <li key={product.id} className="flex items-center gap-4 px-5 py-4">

                            <button onClick={() => onDetail(product)}
                              className="w-20 h-20 rounded-lg overflow-hidden bg-white border border-gray-100 shrink-0">
                              <img onError={useGenericImage} src={product.image} alt={product.displayName} className="w-full h-full object-contain p-1" />
                            </button>

                            <div className="flex-1 min-w-0">
                              <p className="text-orange-500 text-xs uppercase tracking-wide font-black">{product.categoria}</p>
                              <button onClick={() => onDetail(product)}
                                className="text-left text-sm font-bold leading-snug mt-0.5 hover:text-orange-500">
                                {product.displayName}
                              </button>
                              {/* Hay repuestos con el mismo nombre para autos distintos
                                  (el auto no va en el nombre): el código los distingue. */}
                              {product.code && (
                                <p className="text-xs text-gray-400">Código: {product.code}</p>
                              )}
                              <div className="flex items-center gap-3 mt-1.5 text-xs">
                                <span className="text-green-600 font-bold">En stock</span>
                                <button onClick={() => removeFromCart(product.id)}
                                  aria-label={`Quitar ${product.displayName} del carrito`}
                                  className="text-gray-400 hover:text-red-500 underline transition">
                                  Quitar
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center border border-gray-200 rounded-md">
                                <button onClick={() => updateQuantity(product.id, product.quantity - 1)} className="w-8 h-8">−</button>
                                <span className="w-8 text-center text-sm font-bold">{product.quantity}</span>
                                <button
                                  onClick={() => updateQuantity(product.id, product.quantity + 1)}
                                  disabled={alcanzoMaximo}
                                  className="w-8 h-8 disabled:opacity-40"
                                >
                                  +
                                </button>
                              </div>
                              {alcanzoMaximo && (
                                <span className="text-xs text-orange-500 font-bold">Stock máximo</span>
                              )}
                            </div>

                            <div className="w-24 text-right shrink-0">
                              <p className="text-base font-black">{price(product.price * product.quantity)}</p>
                              {product.quantity > 1 && (
                                <p className="text-xs text-gray-400 mt-0.5">{price(product.price)} c/u</p>
                              )}
                            </div>

                          </li>
                        );
                      })}
                    </ul>

                  </section>

                  {/* Las sugerencias acompañan debajo de la lista, chicas,
                      sin competir con el carrito. */}
                  <CartSuggestions onDetail={onDetail} />

                </div>

                {summary}
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
