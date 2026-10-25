import { useState } from "react";
import Navbar from "./Navbar";
import { confirmarCompra, obtenerDirecciones, obtenerMetodosPago } from "./api";
import { useCart } from "./context/CartContext";
import SugerenciasCarrito from "./SugerenciasCarrito";
import EncabezadoPagina from "./EncabezadoPagina";
import { IconoBasura, IconoCandado, IconoCarrito, IconoCheck } from "./Iconos";


export default function Carrito({
  onHome, onCatalogo, onLogin, onMarcas, onCarrito, onFavoritos,
  cantidadFavoritos, onDetalle, onDirecciones, onMetodosPago,
  usuario, onPerfil, onHistorial, onCerrarSesion,
}) {
  const { cart: productos, updateQuantity, removeFromCart, clearCart, total, cargarCarrito } = useCart();

  const subtotal = total;
  const envio = productos.length ? 0 : 0;
  const totalFinal = subtotal + envio;

  const precio = (valor) => `$${valor.toLocaleString("es-UY")}`;
  const unidades = productos.reduce((suma, p) => suma + p.cantidad, 0);

  const [confirmacionAbierta, setConfirmacionAbierta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState(null);
  const [errorCompra, setErrorCompra] = useState("");
  const [direcciones, setDirecciones] = useState([]);
  const [metodosPago, setMetodosPago] = useState([]);
  const [direccionId, setDireccionId] = useState("");
  const [metodoPagoId, setMetodoPagoId] = useState("");
  const [cargandoDatos, setCargandoDatos] = useState(false);

  // La principal, o la primera que se pueda usar (las vencidas no).
  const idPrincipal = (lista) => {
    const usables = lista.filter((item) => !item.vencida);
    const principal = usables.find((item) => item.principal) ?? usables[0];
    return principal ? String(principal.id) : "";
  };

  // Al abrir se traen las direcciones y tarjetas del perfil, con la
  // principal de cada una preseleccionada.
  const abrirConfirmacion = async () => {
    setPedido(null);
    setErrorCompra("");
    setConfirmacionAbierta(true);
    setCargandoDatos(true);
    try {
      const [listaDirecciones, listaMetodos] = await Promise.all([
        obtenerDirecciones(),
        obtenerMetodosPago(),
      ]);
      setDirecciones(listaDirecciones);
      setMetodosPago(listaMetodos);
      setDireccionId(idPrincipal(listaDirecciones));
      setMetodoPagoId(idPrincipal(listaMetodos));
    } catch (error) {
      setErrorCompra(error.message || "No pudimos cargar tus datos de envío y pago.");
    } finally {
      setCargandoDatos(false);
    }
  };

  const textoDireccion = (d) =>
    `${d.calle} ${d.numero}${d.apartamento ? ` apto ${d.apartamento}` : ""}, ${d.ciudad}`;
  const textoMetodoPago = (m) =>
    `${m.tipo} •••• ${m.numero}${m.vencida ? " (vencida)" : ""}`;
  const hayTarjetaVigente = metodosPago.some((m) => !m.vencida);
  const puedeConfirmar = !enviando && !cargandoDatos && direccionId !== "" && metodoPagoId !== "";

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
      const nuevoPedido = await confirmarCompra({
        direccionId: Number(direccionId),
        metodoPagoId: Number(metodoPagoId),
      });
      setPedido(nuevoPedido);
      await cargarCarrito();
    } catch (error) {
      setErrorCompra(error.message || "No pudimos confirmar la compra.");
    } finally {
      setEnviando(false);
    }
  };

  const resumen = (
    <aside className="bg-white border border-gray-200 rounded-xl p-5 h-fit shadow-xs lg:sticky lg:top-24">
      <h2 className="text-base font-black">Resumen del pedido</h2>
      <div className="mt-5 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">
            Subtotal ({unidades} {unidades === 1 ? "unidad" : "unidades"})
          </span>
          <span className="font-bold">{precio(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm"><span className="text-gray-500">Envío</span><span className="text-green-600 font-bold">Gratis</span></div>
      </div>
      <div className="border-t border-gray-200 mt-5 pt-4 flex justify-between items-end">
        <span className="text-sm font-bold">Total</span>
        <span className="text-2xl font-black text-orange-500">{precio(totalFinal)}</span>
      </div>
      <button onClick={abrirConfirmacion} disabled={productos.length === 0}
        className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-md h-12 mt-5 text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-orange-500">
        FINALIZAR COMPRA
      </button>
      <button type="button" onClick={() => onCatalogo()}
        className="w-full mt-2 h-10 text-sm font-bold text-gray-600 hover:text-orange-500 transition">
        Seguir comprando
      </button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-2 pt-3 border-t border-gray-100">
        <IconoCandado className="w-3.5 h-3.5" />
        Pago 100% seguro y protegido
      </p>

      {confirmacionAbierta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5">
          <div role="dialog" aria-modal="true" aria-labelledby="titulo-confirmar-compra"
            className="w-full max-w-[420px] bg-white rounded-xl p-6 shadow-lg">
            {pedido ? (
              <div className="text-center">
                <span className="mx-auto mb-3 w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                  <IconoCheck className="w-7 h-7" />
                </span>
                <h2 id="titulo-confirmar-compra" className="text-lg font-black">¡Compra confirmada!</h2>
                <p className="text-sm text-gray-500 mt-2">Tu número de pedido es</p>
                <p className="text-2xl font-black text-orange-500 mt-1">{`#${pedido.id}`}</p>
                <button onClick={cerrarConfirmacion}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-md py-3 mt-6 text-sm font-black">
                  ACEPTAR
                </button>
              </div>
            ) : (
              <>
                <h2 id="titulo-confirmar-compra" className="text-lg font-black">Confirmá tu compra</h2>
                <ul className="mt-4 space-y-2 max-h-[240px] overflow-y-auto">
                  {productos.map((producto) => (
                    <li key={producto.id} className="flex justify-between gap-3 text-sm">
                      <span>{producto.nombre} × {producto.cantidad}</span>
                      <span className="font-bold whitespace-nowrap">{precio(producto.precio * producto.cantidad)}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-gray-200 mt-4 pt-4 flex justify-between items-end">
                  <span className="text-xs text-gray-400">TOTAL</span>
                  <span className="text-xl font-black text-orange-500">{precio(totalFinal)}</span>
                </div>
                {cargandoDatos ? (
                  <p role="status" className="mt-4 text-sm text-gray-500">Cargando tus datos de envío y pago...</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label htmlFor="direccion-envio" className="block text-xs font-black text-gray-500">DIRECCIÓN DE ENVÍO</label>
                      {direcciones.length > 0 ? (
                        <select id="direccion-envio" value={direccionId} onChange={(e) => setDireccionId(e.target.value)}
                          className="w-full mt-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-white outline-hidden focus:border-orange-500">
                          {direcciones.map((d) => (
                            <option key={d.id} value={String(d.id)}>{textoDireccion(d)}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="mt-1 text-sm text-gray-500">
                          No tenés direcciones guardadas.{" "}
                          <button type="button" onClick={onDirecciones} className="text-orange-500 font-bold hover:underline">
                            Agregar una dirección
                          </button>
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="metodo-pago" className="block text-xs font-black text-gray-500">MÉTODO DE PAGO</label>
                      {hayTarjetaVigente ? (
                        <select id="metodo-pago" value={metodoPagoId} onChange={(e) => setMetodoPagoId(e.target.value)}
                          className="w-full mt-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-white outline-hidden focus:border-orange-500">
                          {metodosPago.map((m) => (
                            <option key={m.id} value={String(m.id)} disabled={m.vencida}>{textoMetodoPago(m)}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="mt-1 text-sm text-gray-500">
                          {metodosPago.length > 0
                            ? "Tus tarjetas guardadas están vencidas."
                            : "No tenés tarjetas guardadas."}{" "}
                          <button type="button" onClick={onMetodosPago} className="text-orange-500 font-bold hover:underline">
                            Agregar una tarjeta
                          </button>
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {errorCompra && (
                  <p role="alert" className="mt-4 text-sm text-red-600 font-bold">{errorCompra}</p>
                )}
                <div className="mt-6 flex gap-3">
                  <button onClick={cerrarConfirmacion} disabled={enviando}
                    className="flex-1 border border-gray-200 rounded-md py-3 text-sm font-black text-gray-500 hover:border-orange-500 hover:text-orange-500 disabled:opacity-40">
                    CANCELAR
                  </button>
                  <button onClick={confirmar} disabled={!puedeConfirmar}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-md py-3 text-sm font-black disabled:opacity-40">
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
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <Navbar paginaActual="carrito" onHome={onHome} onCatalogo={onCatalogo} onLogin={onLogin}
        onMarcas={onMarcas} onCarrito={onCarrito} onFavoritos={onFavoritos}
        usuario={usuario} onPerfil={onPerfil} onDirecciones={onDirecciones}
        onMetodosPago={onMetodosPago} onHistorial={onHistorial} onCerrarSesion={onCerrarSesion}
        cantidadFavoritos={cantidadFavoritos} />

      <main>
        <EncabezadoPagina
          migas={[{ texto: "Inicio", ir: onHome }, "Carrito"]}
          titulo="Tu Carrito de Compras"
          descripcion="Revisá tus repuestos antes de pagar."
        />

        <div className="px-5 md:px-10 py-8">
          <div className="max-w-[1100px] mx-auto">

            {productos.length === 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
                <div className="bg-white border border-gray-200 rounded-xl px-8 py-12 text-center shadow-xs">
                  <span className="mx-auto mb-4 w-16 h-16 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center">
                    <IconoCarrito className="w-8 h-8" />
                  </span>
                  <h2 className="text-xl font-black">Tu carrito está vacío</h2>
                  <p className="text-sm text-gray-400 mt-2">Agregá repuestos desde el catálogo para verlos acá.</p>
                  <button onClick={() => onCatalogo()}
                    className="mt-6 bg-orange-500 hover:bg-orange-600 text-white px-7 py-3 rounded-md text-sm font-black">
                    VER REPUESTOS
                  </button>
                </div>
                {resumen}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
                <div className="min-w-0">

                  {/* LISTA: una sola tarjeta, una fila compacta por
                      producto, para que con muchos no se haga eterna. */}

                  <section className="bg-white border border-gray-200 rounded-xl shadow-xs">

                    <div className="flex justify-between items-center px-5 py-3 border-b border-gray-200">
                      <h2 className="text-base font-black">
                        Productos <span className="text-gray-400 font-bold">({productos.length})</span>
                      </h2>
                      <button onClick={clearCart}
                        className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-red-500 transition">
                        <IconoBasura className="w-4 h-4" />
                        Vaciar carrito
                      </button>
                    </div>

                    <ul className="divide-y divide-gray-100">
                      {productos.map((producto) => {
                        const alcanzoMaximo = producto.cantidad >= producto.stock;
                        return (
                          <li key={producto.id} className="flex items-center gap-4 px-5 py-4">

                            <button onClick={() => onDetalle(producto)}
                              className="w-20 h-20 rounded-lg overflow-hidden bg-white border border-gray-100 shrink-0">
                              <img src={producto.imagen} alt={producto.nombre} className="w-full h-full object-contain p-1" />
                            </button>

                            <div className="flex-1 min-w-0">
                              <p className="text-orange-500 text-[11px] uppercase tracking-wide font-black">{producto.categoria}</p>
                              <button onClick={() => onDetalle(producto)}
                                className="text-left text-sm font-bold leading-snug mt-0.5 hover:text-orange-500">
                                {producto.nombre}
                              </button>
                              {/* Hay repuestos con el mismo nombre para autos distintos
                                  (el auto no va en el nombre): el código los distingue. */}
                              {producto.codigo && (
                                <p className="text-[11px] text-gray-400">Código: {producto.codigo}</p>
                              )}
                              <div className="flex items-center gap-3 mt-1.5 text-xs">
                                <span className="text-green-600 font-bold">En stock</span>
                                <button onClick={() => removeFromCart(producto.id)}
                                  aria-label={`Quitar ${producto.nombre} del carrito`}
                                  className="text-gray-400 hover:text-red-500 underline transition">
                                  Quitar
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center border border-gray-200 rounded-md">
                                <button onClick={() => updateQuantity(producto.id, producto.cantidad - 1)} className="w-8 h-8">−</button>
                                <span className="w-8 text-center text-sm font-bold">{producto.cantidad}</span>
                                <button
                                  onClick={() => updateQuantity(producto.id, producto.cantidad + 1)}
                                  disabled={alcanzoMaximo}
                                  className="w-8 h-8 disabled:opacity-40"
                                >
                                  +
                                </button>
                              </div>
                              {alcanzoMaximo && (
                                <span className="text-[11px] text-orange-500 font-bold">Stock máximo</span>
                              )}
                            </div>

                            <div className="w-24 text-right shrink-0">
                              <p className="text-base font-black">{precio(producto.precio * producto.cantidad)}</p>
                              {producto.cantidad > 1 && (
                                <p className="text-xs text-gray-400 mt-0.5">{precio(producto.precio)} c/u</p>
                              )}
                            </div>

                          </li>
                        );
                      })}
                    </ul>

                  </section>

                  {/* Las sugerencias acompañan debajo de la lista, chicas,
                      sin competir con el carrito. */}
                  <SugerenciasCarrito onDetalle={onDetalle} />

                </div>

                {resumen}
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
