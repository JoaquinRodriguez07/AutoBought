import Navbar from "./Navbar";
import { useCart } from "./context/CartContext";

export default function Favoritos({
  onHome, onCatalogo, onLogin, onMarcas, onCarrito, onFavoritos,
  cantidadFavoritos, favoritos, onAlternarFavorito,
  onDetalle,
}) {
  const { addToCart } = useCart();
  const precio = (v) => `$${v.toLocaleString("es-UY")}`;

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <Navbar paginaActual="favoritos" onHome={onHome} onCatalogo={onCatalogo} onLogin={onLogin}
        onMarcas={onMarcas} onCarrito={onCarrito} onFavoritos={onFavoritos}
        cantidadFavoritos={cantidadFavoritos} />

      <main className="pt-[105px] max-w-[1100px] mx-auto px-5 pb-14">
        <p className="text-orange-500 text-[9px] font-black tracking-[4px]">AUTOBOUGHT</p>
        <h1 className="text-3xl md:text-4xl font-black italic uppercase mt-1">Mis Favoritos</h1>
        <p className="text-[10px] text-gray-500 mt-2">Guardá los repuestos que querés tener a mano.</p>

        {favoritos.length === 0 ? (
          <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-16 text-center">
            <div className="text-5xl mb-4 text-orange-500">♡</div>
            <h2 className="text-xl font-black">Todavía no tenés favoritos</h2>
            <p className="text-[10px] text-gray-400 mt-2">Tocá el corazón de un producto para guardarlo.</p>
            <button onClick={() => onCatalogo()}
              className="mt-6 bg-orange-500 hover:bg-orange-600 text-white px-7 py-3 rounded-md text-[10px] font-black">
              EXPLORAR REPUESTOS
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
            {favoritos.map((producto) => (
              <div key={producto.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition">
                <div className="relative h-[190px] bg-gray-50">
                  <img src={producto.imagen} alt={producto.nombre} className="w-full h-full object-cover" />
                  <button onClick={() => onAlternarFavorito(producto)}
                    className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white shadow-md text-orange-500 text-lg">
                    ♥
                  </button>
                </div>
                <div className="p-4">
                  <p className="text-[9px] text-orange-500 font-black">{producto.marcaPrincipal ?? producto.marca}</p>
                  <button onClick={() => onDetalle(producto)} className="text-left text-[11px] font-black mt-1 hover:text-orange-500">
                    {producto.nombre}
                  </button>
                  <p className="text-lg font-black mt-3">{precio(producto.precio)}</p>
                  {producto.stock === 0 ? (
                    <button disabled
                      className="w-full mt-4 bg-gray-200 text-gray-400 cursor-not-allowed rounded-md py-2.5 text-[9px] font-black">
                      SIN STOCK
                    </button>
                  ) : (
                    <button onClick={() => addToCart(producto, 1)}
                      className="w-full mt-4 bg-orange-500 hover:bg-orange-600 text-white rounded-md py-2.5 text-[9px] font-black">
                      🛒 AGREGAR AL CARRITO
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
