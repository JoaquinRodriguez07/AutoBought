import { useState } from "react";
import Navbar from "./Navbar";
import { confirmarCompra } from "./api";
import { useCart } from "./context/CartContext";
import SugerenciasCarrito from "./SugerenciasCarrito";


export default function Carrito({
  onHome, onCatalogo, onLogin, onMarcas, onCarrito, onFavoritos,
  cantidadFavoritos, onDetalle,
}) {
  const { cart: productos, updateQuantity, removeFromCart, clearCart, total, cargarCarrito } = useCart();

  const subtotal = total;
  const envio = productos.length ? 0 : 0;
  const totalFinal = subtotal + envio;

  const precio = (valor) => `$${valor.toLocaleString("es-UY")}`;

  const [confirmacionAbierta, setConfirmacionAbierta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState(null);
  const [errorCompra, setErrorCompra] = useState("");

  const abrirConfirmacion = () => {
    setPedido(null);
    setErrorCompra("");
    setConfirmacionAbierta(true);
  };

  const cerrarConfirmacion = () => {
    if (enviando) return;
    setConfirmacionAbierta(false);
  };

  // Si sale bien se muestra el número de pedido y se recarga el carrito
  // (queda vacío). Si falla, el mensaje ya viene en español desde el
  // backend: en el 409 dice qué repuesto no alcanza.
  const confirmar = async () => {
    setEnviando(true);
    setErrorCompra("");
    try {
      const nuevoPedido = await confirmarCompra();
      setPedido(nuevoPedido);
      await cargarCarrito();
    } catch (error) {
      setErrorCompra(error.message || "No pudimos confirmar la compra.");
    } finally {
      setEnviando(false);
    }
  };

  const resumen = (
    <aside className="bg-white border border-gray-200 rounded-xl p-5 h-fit shadow-sm">
      <h2 className="text-[13px] font-black">Resumen del pedido</h2>
      <div className="mt-6 space-y-4">
        <div className="flex justify-between text-[10px]"><span className="text-gray-500">Subtotal</span><span className="font-bold">{precio(subtotal)}</span></div>
        <div className="flex justify-between text-[10px]"><span className="text-gray-500">Envío</span><span className="text-green-600 font-bold">Gratis</span></div>
      </div>
      <div className="border-t border-gray-200 mt-6 pt-5 flex justify-between items-end">
        <span className="text-[9px] text-gray-400">TOTAL</span>
        <span className="text-2xl font-black text-orange-500">{precio(totalFinal)}</span>
      </div>
      <button onClick={abrirConfirmacion} disabled={productos.length === 0}
        className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-md py-3 mt-6 text-[10px] font-black disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-orange-500">
        FINALIZAR COMPRA
      </button>
      <p className="text-center text-[7px] text-gray-400 mt-3">🔒 Pago 100% seguro y protegido</p>

      {confirmacionAbierta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5">
          <div role="dialog" aria-modal="true" aria-labelledby="titulo-confirmar-compra"
            className="w-full max-w-[420px] bg-white rounded-xl p-6 shadow-lg">
            {pedido ? (
              <div className="text-center">
                <div className="text-4xl mb-3">✅</div>
                <h2 id="titulo-confirmar-compra" className="text-lg font-black">¡Compra confirmada!</h2>
                <p className="text-[10px] text-gray-500 mt-2">Tu número de pedido es</p>
                <p className="text-2xl font-black text-orange-500 mt-1">{`#${pedido.id}`}</p>
                <button onClick={cerrarConfirmacion}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-md py-3 mt-6 text-[10px] font-black">
                  ACEPTAR
                </button>
              </div>
            ) : (
              <>
                <h2 id="titulo-confirmar-compra" className="text-lg font-black">Confirmá tu compra</h2>
                <ul className="mt-4 space-y-2 max-h-[240px] overflow-y-auto">
                  {productos.map((producto) => (
                    <li key={producto.id} className="flex justify-between gap-3 text-[10px]">
                      <span>{producto.nombre} × {producto.cantidad}</span>
                      <span className="font-bold whitespace-nowrap">{precio(producto.precio * producto.cantidad)}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-gray-200 mt-4 pt-4 flex justify-between items-end">
                  <span className="text-[9px] text-gray-400">TOTAL</span>
                  <span className="text-xl font-black text-orange-500">{precio(totalFinal)}</span>
                </div>
                {errorCompra && (
                  <p role="alert" className="mt-4 text-[10px] text-red-600 font-bold">{errorCompra}</p>
                )}
                <div className="mt-6 flex gap-3">
                  <button onClick={cerrarConfirmacion} disabled={enviando}
                    className="flex-1 border border-gray-200 rounded-md py-3 text-[10px] font-black text-gray-500 hover:border-orange-500 hover:text-orange-500 disabled:opacity-40">
                    CANCELAR
                  </button>
                  <button onClick={confirmar} disabled={enviando}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-md py-3 text-[10px] font-black disabled:opacity-40">
                    {enviando ? "CONFIRMANDO..." : "CONFIRMAR COMPRA"}
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
    <div className="min-h-screen bg-[#f7f7f7] text-gray-900 font-sans">
      <Navbar paginaActual="carrito" onHome={onHome} onCatalogo={onCatalogo} onLogin={onLogin}
        onMarcas={onMarcas} onCarrito={onCarrito} onFavoritos={onFavoritos}
        cantidadFavoritos={cantidadFavoritos} />

      <main className="pt-[105px] max-w-[1100px] mx-auto px-5 pb-14">
        <div className="mb-7">
          <p className="text-orange-500 text-[9px] font-black tracking-[4px]">AUTOBOUGHT</p>
          <h1 className="text-3xl md:text-4xl font-black italic uppercase mt-1">Tu Carrito de Compras</h1>
          <p className="text-[10px] text-gray-500 mt-2">Revisá tus repuestos antes de proceder al pago.</p>
        </div>

        {productos.length === 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_310px] gap-6">
            <div className="bg-white border border-gray-200 rounded-xl p-16 text-center shadow-sm">
              <div className="text-5xl mb-4">🛒</div>
              <h2 className="text-xl font-black">Tu carrito está vacío</h2>
              <p className="text-[10px] text-gray-400 mt-2">Agregá repuestos desde el catálogo para verlos acá.</p>
              <button onClick={() => onCatalogo()}
                className="mt-6 bg-orange-500 hover:bg-orange-600 text-white px-7 py-3 rounded-md text-[10px] font-black">
                VER REPUESTOS
              </button>
            </div>
            {resumen}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_310px] gap-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-bold">{productos.length} producto(s)</p>
                <button onClick={clearCart} className="text-[9px] text-gray-400 hover:text-orange-500">
                  Vaciar carrito
                </button>
              </div>

              {productos.map((producto) => {
                const alcanzoMaximo = producto.cantidad >= producto.stock;
                return (
                  <div key={producto.id} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row gap-4 shadow-sm">
                    <button onClick={() => onDetalle(producto)} className="w-full md:w-[150px] h-[115px] rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                      <img src={producto.imagen} alt={producto.nombre} className="w-full h-full object-cover" />
                    </button>

                    <div className="flex-1">
                      <p className="text-orange-500 text-[8px] font-black">{producto.marcaPrincipal ?? producto.marca}</p>
                      <button onClick={() => onDetalle(producto)} className="text-left text-[12px] font-black mt-1 hover:text-orange-500">
                        {producto.nombre}
                      </button>
                      <p className="text-[9px] text-green-600 font-bold mt-3">✓ En stock</p>
                    </div>

                    <div className="flex md:flex-col items-center justify-center gap-2">
                      <span className="text-[8px] text-gray-400">Cantidad</span>
                      <div className="flex items-center border border-gray-200 rounded-md">
                        <button onClick={() => updateQuantity(producto.id, producto.cantidad - 1)} className="w-8 h-8">−</button>
                        <span className="w-8 text-center text-[10px] font-bold">{producto.cantidad}</span>
                        <button
                          onClick={() => updateQuantity(producto.id, producto.cantidad + 1)}
                          disabled={alcanzoMaximo}
                          className="w-8 h-8 disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                      {alcanzoMaximo && (
                        <span className="text-[7px] text-orange-500 font-bold">Stock máximo</span>
                      )}
                    </div>

                    <div className="flex md:flex-col justify-center items-end min-w-[100px]">
                      <p className="text-lg font-black">{precio(producto.precio * producto.cantidad)}</p>
                      <p className="text-[8px] text-gray-400 mt-1">{precio(producto.precio)} c/u</p>
                    </div>

                    <button onClick={() => removeFromCart(producto.id)}
                      className="self-center w-9 h-9 rounded-md border border-gray-200 text-gray-400 hover:border-orange-500 hover:text-orange-500">
                      🗑
                    </button>
                  </div>
                );
                
              })}
              <SugerenciasCarrito />
            </div>
            
 
            {resumen}
          </div>
        )}
      </main>
    </div>
  );
}
