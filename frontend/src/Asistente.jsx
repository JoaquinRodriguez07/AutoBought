import { useState } from "react";
import { useNavigate } from "react-router-dom";

import ConfirmacionAgregarCarrito from "./ConfirmacionAgregarCarrito";
import EncabezadoPagina from "./EncabezadoPagina";
import { IconoCarrito, IconoChispa } from "./Iconos";
import Navbar from "./Navbar";
import { consultarAsistente } from "./api";
import { useCart } from "./context/CartContext";
import { useVehicle, vehiculoCompleto } from "./context/VehicleContext";

const EJEMPLOS = [
  "Chilla cuando freno",
  "Le cuesta arrancar a la mañana",
  "Se recalienta en el tráfico",
  "Las luces alumbran poco de noche",
];

const URGENCIAS = {
  alta: { texto: "Urgencia alta", clase: "bg-red-50 text-red-600 border-red-200" },
  media: { texto: "Conviene resolverlo pronto", clase: "bg-amber-50 text-amber-700 border-amber-200" },
  baja: { texto: "Mantenimiento", clase: "bg-green-50 text-green-700 border-green-200" },
};

const precio = (valor) => `$${Number(valor || 0).toLocaleString("es-UY")}`;

/**
 * Asistente de compra (HU 6.1): el cliente cuenta con sus palabras qué le
 * pasa al auto y recibe un diagnóstico breve y repuestos compatibles con su
 * vehículo. Los repuestos los elige el backend (existen, son compatibles y
 * tienen stock); la IA solo interpreta el síntoma. Si la IA no responde, se
 * ofrece buscar el mismo texto en el catálogo.
 */
export default function Asistente({ onDetalle, onCarrito, onHome, ...propsNavbar }) {
  const navigate = useNavigate();
  const { vehiculoActivo } = useVehicle();
  const { addToCart, deshacerAgregado } = useCart();

  const [texto, setTexto] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const [productoAgregado, setProductoAgregado] = useState(null);

  const conVehiculo = vehiculoCompleto(vehiculoActivo);
  const nombreVehiculo = conVehiculo
    ? `${vehiculoActivo.brand} ${vehiculoActivo.model} ${vehiculoActivo.year}`
    : "";

  const consultar = async (e) => {
    e.preventDefault();
    const consulta = texto.trim();
    if (consulta.length < 3 || consultando) return;

    setConsultando(true);
    setError(null);
    setResultado(null);

    try {
      setResultado(
        await consultarAsistente({
          texto: consulta,
          marca: vehiculoActivo.brand,
          modelo: vehiculoActivo.model,
          anio: vehiculoActivo.year,
        })
      );
    } catch (err) {
      setError({ mensaje: err.message, status: err.status, texto: consulta });
    } finally {
      setConsultando(false);
    }
  };

  const agregar = async (producto) => {
    if (await addToCart(producto, 1)) {
      setProductoAgregado({ ...producto, cantidadAgregada: 1 });
    }
  };

  const buscarEnCatalogo = (consulta) => navigate(`/catalogo?q=${encodeURIComponent(consulta)}`);

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <ConfirmacionAgregarCarrito
        producto={productoAgregado}
        onDeshacer={(item) => deshacerAgregado(item.id, item.cantidadAgregada)}
        onCerrar={() => setProductoAgregado(null)}
        onVerCarrito={() => {
          setProductoAgregado(null);
          onCarrito?.();
        }}
      />

      <Navbar paginaActual="asistente" onHome={onHome} onCarrito={onCarrito} {...propsNavbar} />

      <main>
        <EncabezadoPagina
          migas={[{ texto: "Inicio", ir: onHome }, "Asistente"]}
          titulo="Asistente de compra"
          descripcion="Contanos con tus palabras qué le pasa a tu auto y te decimos qué repuestos revisar."
        />

        <div className="max-w-[900px] mx-auto px-5 md:px-10 py-10 box-content">

          {!conVehiculo ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-10 text-center">
              <h2 className="text-xl font-black">Primero elegí tu vehículo</h2>
              <p className="text-sm text-gray-500 mt-2">
                Así te recomendamos solo repuestos que le sirvan a tu auto.
              </p>
              <button
                type="button"
                onClick={onHome}
                className="mt-6 bg-orange-500 hover:bg-orange-600 text-white px-7 py-3 rounded-md text-sm font-black"
              >
                ELEGIR VEHÍCULO
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={consultar} className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
                <p className="text-sm text-gray-500">
                  Tu vehículo: <span className="font-bold text-gray-900">{nombreVehiculo}</span>
                </p>

                <label htmlFor="asistente-texto" className="block mt-4 text-sm font-black">
                  ¿Qué le pasa a tu auto?
                </label>
                <textarea
                  id="asistente-texto"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Por ejemplo: hace un ruido metálico cuando freno"
                  className="mt-2 w-full border border-gray-300 rounded-md px-4 py-3 text-sm focus:outline-hidden focus:border-orange-500"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  {EJEMPLOS.map((ejemplo) => (
                    <button
                      key={ejemplo}
                      type="button"
                      onClick={() => setTexto(ejemplo)}
                      className="text-xs border border-gray-200 rounded-full px-3 py-1.5 text-gray-600 hover:border-orange-500 hover:text-orange-500 transition"
                    >
                      {ejemplo}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={consultando || texto.trim().length < 3}
                  className="mt-5 flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white px-7 py-3 rounded-md text-sm font-black"
                >
                  <IconoChispa className="w-4 h-4" />
                  {consultando ? "PENSANDO..." : "CONSULTAR"}
                </button>
              </form>

              <p className="mt-3 text-xs text-gray-400">
                Es una orientación; no reemplaza la revisión de un mecánico.
              </p>
            </>
          )}

          {error && (
            <div role="alert" className="mt-8 bg-red-50 border border-red-200 rounded-xl p-6">
              <p className="text-sm font-bold text-red-600">{error.mensaje}</p>
              {error.status !== 429 && error.status !== 401 && (
                <button
                  type="button"
                  onClick={() => buscarEnCatalogo(error.texto)}
                  className="mt-4 bg-white border border-gray-300 hover:border-orange-500 px-5 py-2.5 rounded-md text-sm font-black"
                >
                  BUSCAR "{error.texto}" EN EL CATÁLOGO
                </button>
              )}
            </div>
          )}

          {resultado && (
            <section aria-label="Respuesta del asistente" className="mt-8">
              <div className="border border-gray-200 rounded-xl p-6">
                {!resultado.fueraDeTema && (
                  <span className={`inline-block text-xs font-black border rounded-full px-3 py-1 ${URGENCIAS[resultado.urgencia]?.clase}`}>
                    {URGENCIAS[resultado.urgencia]?.texto}
                  </span>
                )}
                <p className="mt-3 text-base">{resultado.diagnostico}</p>

                {resultado.aviso && (
                  <p role="alert" className="mt-4 bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-3 text-sm font-bold">
                    {resultado.aviso}
                  </p>
                )}

                {resultado.pregunta && (
                  <p className="mt-4 text-sm text-gray-600">
                    <span className="font-bold">Para afinar:</span> {resultado.pregunta}
                  </p>
                )}
              </div>

              {!resultado.fueraDeTema && resultado.recomendaciones.length === 0 && (
                <p className="mt-6 text-sm text-gray-500">
                  No encontramos repuestos de esos tipos para tu {nombreVehiculo}.{" "}
                  <button type="button" onClick={() => buscarEnCatalogo(texto)} className="font-bold text-orange-500 hover:underline">
                    Buscar en el catálogo
                  </button>
                </p>
              )}

              {resultado.recomendaciones.map((recomendacion) => (
                <div key={recomendacion.tipo} className="mt-8">
                  <h2 className="text-lg font-black">{recomendacion.tipo}</h2>
                  <p className="text-sm text-gray-500 mt-1">{recomendacion.motivo}</p>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {recomendacion.repuestos.map((producto) => (
                      <article key={producto.id} className="border border-gray-100 rounded-xl overflow-hidden shadow-xs">
                        <div className="relative h-[160px] bg-white">
                          <img src={producto.imagen} alt={producto.nombre} className="w-full h-full object-contain p-3" />
                        </div>
                        <div className="p-4">
                          <p className="text-xs font-black uppercase text-orange-500">{producto.fabricante}</p>
                          <h3 className="mt-1 text-sm font-black">{producto.nombre}</h3>
                          <p className="text-xs text-gray-400 mt-1">Código: {producto.codigo}</p>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-lg font-black">{precio(producto.precio)}</span>
                            <span className={`text-xs font-bold ${producto.stock > 0 ? "text-green-600" : "text-red-500"}`}>
                              {producto.stock > 0 ? `${producto.stock} en stock` : "Sin stock"}
                            </span>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => agregar(producto)}
                              disabled={producto.stock === 0}
                              className="flex-1 flex items-center justify-center gap-2 h-9 rounded-md text-xs font-bold bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white"
                            >
                              <IconoCarrito />
                              Agregar al carrito
                            </button>
                            <button
                              type="button"
                              onClick={() => onDetalle?.(producto)}
                              className="px-3 h-9 rounded-md text-xs font-bold border border-gray-300 hover:border-orange-500"
                            >
                              Ver detalle
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
