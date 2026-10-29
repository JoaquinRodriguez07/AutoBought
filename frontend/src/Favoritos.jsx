import { usarImagenGenerica } from "./mapearRepuesto";
import Navbar from "./Navbar";
import BotonAgregarCarrito from "./BotonAgregarCarrito";
import { IconoCarrito, IconoCorazon } from "./Iconos";
import EncabezadoPagina from "./EncabezadoPagina";

export default function Favoritos({
  onHome, onCatalogo, onLogin, onMarcas, onCarrito, onFavoritos,
  cantidadFavoritos, favoritos, onAlternarFavorito,
  onDetalle,
  usuario, onPerfil, onDirecciones, onHistorial, onCerrarSesion,
}) {
  const precio = (v) => `$${v.toLocaleString("es-UY")}`;

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <Navbar paginaActual="favoritos" onHome={onHome} onCatalogo={onCatalogo} onLogin={onLogin}
        onMarcas={onMarcas} onCarrito={onCarrito} onFavoritos={onFavoritos}
        usuario={usuario} onPerfil={onPerfil} onDirecciones={onDirecciones}
        onHistorial={onHistorial} onCerrarSesion={onCerrarSesion}
        cantidadFavoritos={cantidadFavoritos} />

      <main>
        <EncabezadoPagina
          migas={[{ texto: "Inicio", ir: onHome }, "Favoritos"]}
          titulo="Mis favoritos"
          descripcion="Los repuestos que guardaste para tener a mano."
        />

        <div className="max-w-[1100px] mx-auto px-5 md:px-10 pb-14 box-content">

          {favoritos.length === 0 ? (
            <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-16 text-center">
              <span className="mx-auto mb-4 w-16 h-16 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center">
                <IconoCorazon className="w-8 h-8" />
              </span>
              <h2 className="text-xl font-black">Todavía no tenés favoritos</h2>
              <p className="text-sm text-gray-400 mt-2">Tocá el corazón de un producto para guardarlo.</p>
              <button onClick={() => onCatalogo()}
                className="mt-6 bg-orange-500 hover:bg-orange-600 text-white px-7 py-3 rounded-md text-sm font-black">
                EXPLORAR REPUESTOS
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
              {favoritos.map((producto) => (
                <div key={producto.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-xs hover:shadow-lg transition">
                  <div className="relative h-[190px] bg-white">
                    <img onError={usarImagenGenerica} src={producto.imagen} alt={producto.nombre} className="w-full h-full object-contain p-3" />
                    <button onClick={() => onAlternarFavorito(producto)}
                      aria-label="Quitar de favoritos"
                      className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white shadow-md text-orange-500 flex items-center justify-center transition hover:scale-105">
                      <IconoCorazon lleno className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-4">
                    <p className="text-[11px] uppercase tracking-wide text-orange-500 font-black">{producto.fabricante}</p>
                    <button onClick={() => onDetalle(producto)} className="text-left text-sm font-bold mt-1 hover:text-orange-500">
                      {producto.nombre}
                    </button>
                    <p className="text-lg font-black mt-3">{precio(producto.precio)}</p>
                    <BotonAgregarCarrito producto={producto} textoSinStock="SIN STOCK"
                      className="w-full mt-4 flex items-center justify-center gap-2 rounded-md py-2.5 text-xs font-black">
                      <IconoCarrito />
                      AGREGAR AL CARRITO
                    </BotonAgregarCarrito>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
