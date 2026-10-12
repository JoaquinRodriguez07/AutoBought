import { useState } from "react";
import Navbar from "./Navbar";
import { useCart } from "./context/CartContext";
import { useVehicle } from "./context/VehicleContext";

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
}) {
  const { addToCart } = useCart();
  const { vehiculoActivo: filtrosVehiculo } = useVehicle();
  const [cantidad, setCantidad] = useState(1);
  const [imagenActiva, setImagenActiva] = useState(0);
  const [pestana, setPestana] = useState("descripcion");

  // DEUDA CONOCIDA (diferida): si no llega `producto` (refresh o link
  // compartido a /producto, donde el estado de App ya está vacío) se
  // renderiza este producto inventado, con opiniones y specs que no
  // existen en ninguna base, y su AGREGAR mete el id fantasma "BP1234"
  // en el carrito real. Además, su breadcrumb llama a onCatalogo("Frenos")
  // y el backend no tiene ninguna categoría "Frenos", así que ese camino
  // termina en 'No hay productos en la categoría "Frenos"'. El arreglo de
  // verdad necesita un id en la ruta (/producto/:id) y un
  // GET /api/v1/parts/{id} que hoy no existe.
  const productoActual = producto || {
    id: "BP1234", marca: "BOSCH", nombre: "Pastillas de Freno Delanteras Bosch",
    codigo: "BP1234", precio: 2450, categoria: "Frenos",
    imagen: "https://images.unsplash.com/photo-1530046339160-ce3e530c7d2f?q=80&w=900&auto=format&fit=crop",
    descripcion: "Pastillas de freno delanteras Bosch de alta performance. Diseñadas para brindar máxima seguridad y frenado eficiente.",
    stock: 12,
    especificaciones: [["Posición","Delanteras"],["Sistema de freno","Disco"],["Ancho","156,3 mm"],["Alto","58,7 mm"],["Espesor","17,5 mm"],["Material","Semi-metálico"]],
    aplicaciones: ["Volkswagen Gol 2019 Highline 1.6 MSI","Volkswagen Gol 2018 1.6 MSI","Volkswagen Voyage 2019 1.6 MSI"],
    garantia: "6 meses por defectos de fabricación.",
    opiniones: [{nombre:"Martín",estrellas:5,texto:"Muy buena calidad y encajaron perfecto."},{nombre:"Lucía",estrellas:5,texto:"Llegaron rápido y el producto es excelente."}],
  };

  // Nota de opiniones: se calcula con las opiniones REALES del producto.
  // Si no hay ninguna no se muestra nota. Antes había un ★ 4.8/5 fijo que
  // se renderizaba incluso arriba del estado vacío "todavía no tiene
  // opiniones", es decir un número inventado presentado como la nota real
  // del repuesto (todos los que vienen de la API llegan sin `opiniones`).
  const opiniones = productoActual.opiniones || [];
  const promedioOpiniones = opiniones.length
    ? (
        opiniones.reduce((total, o) => total + (o.estrellas || 0), 0) /
        opiniones.length
      ).toFixed(1)
    : null;

  const favorito = esFavorito(productoActual.id);
  const imagenes = [productoActual.imagen, productoActual.imagen, productoActual.imagen];

  // =====================================================
  // AGREGAR AL CARRITO
  // =====================================================

  const sinStock = productoActual.stock === 0;

  const agregar = () => {
    if (sinStock) return;
    addToCart(productoActual, cantidad);
    setCantidad(1);
  };

  const tabs = [
    ["descripcion", "Descripción"],
    ["especificaciones", "Especificaciones"],
    ["aplicaciones", "Aplicaciones"],
    ["garantia", "Garantía"],
    ["opiniones", `Opiniones (${productoActual.opiniones?.length || 0})`],
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <Navbar paginaActual="detalle" onHome={onHome} onCatalogo={onCatalogo} onLogin={onLogin}
        onMarcas={onMarcas} onCarrito={onCarrito} onFavoritos={onFavoritos}
        cantidadFavoritos={cantidadFavoritos} />

      <main className="pt-[88px]">
        <div className="max-w-[1200px] mx-auto px-5 md:px-10 py-4">
          <div className="flex items-center gap-2 text-[9px] text-gray-400">
            <button onClick={onHome} className="hover:text-orange-500">Inicio</button><span>›</span>
            <button onClick={() => onCatalogo(productoActual.categoria)} className="hover:text-orange-500">{productoActual.categoria}</button>
            <span>›</span><span>{productoActual.nombre}</span>
          </div>
        </div>

        <section className="max-w-[1200px] mx-auto px-5 md:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr_0.7fr] gap-7">
            <div>
              <div className="relative h-[360px] bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
                <img src={imagenes[imagenActiva]} alt={productoActual.nombre} className="w-full h-full object-cover" />
                <button onClick={() => onAlternarFavorito(productoActual)}
                  className={`absolute top-4 right-4 w-10 h-10 bg-white rounded-full shadow-md text-xl ${favorito ? "text-orange-500" : "text-gray-500"}`}>
                  {favorito ? "♥" : "♡"}
                </button>
              </div>
              <div className="flex items-center gap-3 mt-3">
                {imagenes.map((imagen, index) => (
                  <button key={index} onClick={() => setImagenActiva(index)}
                    className={`w-[70px] h-[58px] rounded-md overflow-hidden border-2 ${imagenActiva === index ? "border-orange-500" : "border-gray-200"}`}>
                    <img src={imagen} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-orange-500 text-[11px] font-black">{productoActual.marcaPrincipal ?? productoActual.marca}</p>
              <h1 className="text-2xl md:text-3xl font-black mt-2 leading-tight">{productoActual.nombre}</h1>
              <p className="text-[10px] text-gray-400 mt-2">Código: {productoActual.codigo}</p>
              <p className="text-3xl font-black text-orange-500 mt-5">${productoActual.precio.toLocaleString("es-UY")}</p>
              {sinStock ? (
                <p className="text-[10px] mt-2"><span className="text-red-500 font-bold">Sin stock</span></p>
              ) : (
                <p className="text-[10px] mt-2"><span className="text-green-600 font-bold">En stock</span><span className="text-gray-400 ml-2">({productoActual.stock} unidades)</span></p>
              )}

              <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 mt-5">
                <p className="text-[9px] font-black">🚗 Compatible con tu vehículo</p>
                <p className="text-[10px] font-bold mt-2">
                  {filtrosVehiculo?.brand && filtrosVehiculo?.model
                    ? `${filtrosVehiculo.brand} ${filtrosVehiculo.model}${
                        filtrosVehiculo.year ? ` ${filtrosVehiculo.year}` : ""
                      }`
                    : "Vehículo seleccionado"}
                </p>
                <button className="text-[9px] text-orange-500 underline mt-1">Cambiar vehículo</button>
              </div>

              <div className="flex gap-3 mt-5">
                <div className="flex border border-gray-200 rounded-md">
                  <button onClick={() => setCantidad((v) => Math.max(1, v - 1))} disabled={sinStock} className="w-9 disabled:opacity-40">−</button>
                  <span className="w-9 flex items-center justify-center text-[10px]">{sinStock ? 0 : cantidad}</span>
                  <button onClick={() => setCantidad((v) => Math.min(productoActual.stock, v + 1))} disabled={sinStock || cantidad >= productoActual.stock} className="w-9 disabled:opacity-40">+</button>
                </div>
                <button
                  onClick={agregar}
                  disabled={sinStock}
                  className={`flex-1 rounded-md text-[10px] font-black transition ${
                    sinStock ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600 text-white"
                  }`}
                >
                  {sinStock ? "SIN STOCK" : "🛒 AGREGAR AL CARRITO"}
                </button>
              </div>
              <button onClick={() => onAlternarFavorito(productoActual)}
                className={`w-full mt-2 h-10 border rounded-md text-[10px] font-bold ${favorito ? "border-orange-500 text-orange-500" : "border-gray-200 text-gray-600"}`}>
                {favorito ? "♥ Agregado a favoritos" : "♡ Agregar a favoritos"}
              </button>
            </div>

            <div className="space-y-3">
              <div className="border border-gray-100 rounded-xl shadow-sm p-5">
                <p className="text-[10px] font-black">🛡 Garantía</p>
                <p className="text-[9px] text-gray-500 mt-1">{productoActual.garantia || "Consultar garantía."}</p>
                <div className="border-t my-4" />
                <p className="text-[10px] font-black">🚚 Envíos</p>
                <p className="text-[9px] text-gray-500 mt-1">A todo el país</p>
                <div className="border-t my-4" />
                <p className="text-[10px] font-black">↩ Devoluciones</p>
                <p className="text-[9px] text-gray-500 mt-1">30 días</p>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-[1200px] mx-auto px-5 md:px-10 mt-10">
          <div className="border-t border-gray-200">
            <div className="flex gap-7 border-b border-gray-200 overflow-x-auto">
              {tabs.map(([id, label]) => (
                <button key={id} onClick={() => setPestana(id)}
                  className={`py-4 text-[10px] font-bold whitespace-nowrap border-b-2 ${pestana === id ? "text-orange-500 border-orange-500" : "text-gray-500 border-transparent"}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="py-8">
              {pestana === "descripcion" && (
                <div className="max-w-[800px]">
                  <h2 className="text-[11px] font-black uppercase">Descripción</h2>
                  <p className="text-[10px] text-gray-600 leading-relaxed mt-4">{productoActual.descripcion || "Este repuesto todavía no tiene una descripción cargada."}</p>
                </div>
              )}

              {pestana === "especificaciones" && (
                <div>
                  <h2 className="text-[11px] font-black uppercase mb-5">Especificaciones técnicas</h2>
                  {!productoActual.especificaciones?.length && (
                    <p className="text-[9px] text-gray-400">Este repuesto no tiene especificaciones cargadas.</p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-14 gap-y-3 max-w-[800px]">
                    {(productoActual.especificaciones || []).map(([clave, valor]) => (
                      <div key={clave} className="flex justify-between border-b border-gray-100 pb-2">
                        <span className="text-[9px] text-gray-500">{clave}</span>
                        <span className="text-[9px] font-bold">{valor}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pestana === "aplicaciones" && (
                <div>
                  <h2 className="text-[11px] font-black uppercase">Aplicaciones y compatibilidad</h2>
                  <p className="text-[9px] text-gray-500 mt-2">Vehículos para los que está indicado este repuesto:</p>
                  {!productoActual.aplicaciones?.length && (
                    <p className="text-[9px] text-gray-400 mt-4">Este repuesto no tiene aplicaciones cargadas.</p>
                  )}
                  <div className="mt-5 space-y-2 max-w-[700px]">
                    {(productoActual.aplicaciones || []).map((aplicacion) => (
                      <div key={aplicacion} className="bg-gray-50 rounded-md px-4 py-3 text-[10px]">
                        <span className="text-green-600 mr-2">✓</span>{aplicacion}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pestana === "garantia" && (
                <div className="max-w-[700px]">
                  <h2 className="text-[11px] font-black uppercase">Garantía</h2>
                  <div className="bg-orange-50 border border-orange-100 rounded-xl p-5 mt-4">
                    <p className="text-[11px] font-black">🛡 Garantía del producto</p>
                    <p className="text-[10px] text-gray-600 mt-2">{productoActual.garantia || "Consultar garantía."}</p>
                  </div>
                </div>
              )}

              {pestana === "opiniones" && (
                <div className="max-w-[800px]">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-[11px] font-black uppercase">Opiniones de clientes</h2>
                    {promedioOpiniones && (
                      <span className="text-orange-500 font-black text-lg">★ {promedioOpiniones}/5</span>
                    )}
                  </div>
                  {!productoActual.opiniones?.length && (
                    <p className="text-[9px] text-gray-400">Este repuesto todavía no tiene opiniones.</p>
                  )}
                  <div className="space-y-3">
                    {(productoActual.opiniones || []).map((opinion, index) => (
                      <div key={index} className="border border-gray-100 rounded-xl p-4">
                        <div className="flex justify-between">
                          <p className="text-[10px] font-black">{opinion.nombre}</p>
                          <p className="text-orange-500 text-[10px]">{"★".repeat(opinion.estrellas)}</p>
                        </div>
                        <p className="text-[9px] text-gray-500 mt-2">{opinion.texto}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
