import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import ConfirmacionAgregarCarrito from "./ConfirmacionAgregarCarrito";
import { IconoAlerta, IconoCarrito, IconoCerrar, IconoCheck, IconoEnviar, IconoPit } from "./Iconos";
import { useCart } from "./context/CartContext";
import { vehiculoCompleto } from "./context/VehicleContext";

const EJEMPLOS = [
  "Chilla cuando freno",
  "Le cuesta arrancar a la mañana",
  "Se recalienta en el tráfico",
  "Las luces alumbran poco de noche",
];

const URGENCIAS = {
  media: { texto: "Conviene resolverlo pronto", clase: "bg-amber-50 text-amber-800 border-amber-200" },
  baja: { texto: "Mantenimiento", clase: "bg-green-50 text-green-800 border-green-200" },
};

// Cuándo pasa cada paso de "pensando". Son aproximados: el backend hace
// todo en un solo pedido, pero estos son los pasos que hace de verdad.
const PASOS_MS = [1500, 3500];

const precio = (valor) => `$${Number(valor || 0).toLocaleString("es-UY")}`;

/**
 * ChatPit
 * ==========================================
 * La conversación con Pit, el asistente con IA. Solo dibuja: la lógica
 * (mensajes, historial firmado, errores) está en useConversacionPit, que
 * llega por `conversacion`. Ocupa todo el alto de su contenedor: la página
 * /asistente y el panel flotante (PanelPit), que le pasa `onCerrar`.
 */
export default function ChatPit({
  vehiculo,
  conversacion,
  onDetalle,
  onElegirVehiculo,
  onBuscarEnCatalogo,
  onVerCarrito,
  onCerrar,
  autoFocus = false,
}) {
  const { mensajes, pensando, enviar, reiniciar } = conversacion;
  const { addToCart, deshacerAgregado } = useCart();
  const [texto, setTexto] = useState("");
  const [productoAgregado, setProductoAgregado] = useState(null);
  const lista = useRef(null);

  const conVehiculo = vehiculoCompleto(vehiculo);
  const nombreVehiculo = conVehiculo ? `${vehiculo.brand} ${vehiculo.model} ${vehiculo.year}` : "";
  const ultimo = mensajes.at(-1);

  // Lo nuevo queda a la vista. Una respuesta de Pit se muestra desde su
  // comienzo (urgencia y diagnóstico, lo más importante) aunque sea larga;
  // lo demás (el mensaje del cliente, "pensando"), al final.
  useEffect(() => {
    const contenedor = lista.current;
    if (!contenedor) return;
    const ancla = !pensando && ultimo?.rol === "pit" ? contenedor.querySelector("[data-ancla]") : null;
    contenedor.scrollTop = ancla ? ancla.offsetTop - 16 : contenedor.scrollHeight;
  }, [ultimo, pensando]);

  const mandar = (contenido) => {
    if (contenido.trim().length < 3 || pensando) return;
    enviar(contenido);
    setTexto("");
  };

  const agregar = async (producto) => {
    if (await addToCart(producto, 1)) setProductoAgregado({ ...producto, cantidadAgregada: 1 });
  };

  const agregarTodos = async (productos) => {
    let agregados = 0;
    for (const producto of productos) {
      if (await addToCart(producto, 1)) agregados += 1;
    }
    if (agregados > 0) {
      toast.success(agregados === 1 ? "Agregamos 1 repuesto al carrito." : `Agregamos ${agregados} repuestos al carrito.`);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <ConfirmacionAgregarCarrito
        producto={productoAgregado}
        onDeshacer={(item) => deshacerAgregado(item.id, item.cantidadAgregada)}
        onCerrar={() => setProductoAgregado(null)}
        onVerCarrito={() => {
          setProductoAgregado(null);
          onVerCarrito?.();
        }}
      />

      {/* Encabezado */}
      <div className="bg-[#151719] text-white px-5 py-4 flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
          <IconoPit className="w-6 h-6" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-base font-black leading-tight">Pit</p>
          <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden="true" />
            Tu mecánico con IA
          </p>
        </div>
        {mensajes.length > 0 && (
          <button
            type="button"
            onClick={reiniciar}
            aria-label="Nueva conversación"
            className="h-11 px-3 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 transition shrink-0"
          >
            {/* En celular, corto para que entre el encabezado. */}
            <span className="sm:hidden">Nueva</span>
            <span className="hidden sm:inline">Nueva conversación</span>
          </button>
        )}
        {onCerrar && (
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar Pit"
            className="w-11 h-11 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition shrink-0"
          >
            <IconoCerrar className="w-5 h-5" />
          </button>
        )}
      </div>

      {conVehiculo && (
        <div className="px-5 py-2.5 border-b border-gray-200 bg-white flex items-center justify-between text-sm">
          <span className="font-bold">{nombreVehiculo}</span>
          <button type="button" onClick={onElegirVehiculo} className="font-bold text-orange-700 hover:underline">
            Cambiar
          </button>
        </div>
      )}

      {/* Mensajes */}
      <div ref={lista} role="log" aria-label="Conversación con Pit" className="relative flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        {!conVehiculo ? (
          <>
            <BurbujaPit>Para recomendarte solo repuestos que le sirvan a tu auto, primero elegí cuál es.</BurbujaPit>
            <button
              type="button"
              onClick={onElegirVehiculo}
              className="self-start h-11 px-5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-black"
            >
              Elegir vehículo
            </button>
          </>
        ) : (
          <>
            <BurbujaPit>
              ¡Hola! Contame con tus palabras qué le pasa a tu {vehiculo.model} y te digo qué revisar.
            </BurbujaPit>
            {mensajes.length === 0 && (
              <Opciones titulo="Por ejemplo" opciones={EJEMPLOS} onElegir={mandar} />
            )}
          </>
        )}

        {mensajes.map((mensaje) =>
          mensaje.rol === "cliente" ? (
            <p
              key={mensaje.id}
              className="self-end max-w-[85%] bg-orange-500 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm whitespace-pre-wrap motion-safe:animate-aparecer"
            >
              {mensaje.texto}
            </p>
          ) : mensaje.error ? (
            <ErrorPit key={mensaje.id} mensaje={mensaje} ancla={mensaje === ultimo} onBuscarEnCatalogo={onBuscarEnCatalogo} />
          ) : (
            <RespuestaPit
              key={mensaje.id}
              mensaje={mensaje}
              ancla={mensaje === ultimo}
              nombreVehiculo={nombreVehiculo}
              onAgregar={agregar}
              onAgregarTodos={agregarTodos}
              onDetalle={onDetalle}
              onBuscarEnCatalogo={onBuscarEnCatalogo}
            />
          )
        )}

        {pensando && <Pensando nombreVehiculo={nombreVehiculo} />}

        {/* Las respuestas rápidas son solo para la última pregunta. */}
        {!pensando && ultimo?.respuesta?.opciones?.length > 0 && (
          <Opciones titulo="Respuestas rápidas" opciones={ultimo.respuesta.opciones} onElegir={mandar} />
        )}
      </div>

      {/* Escribir */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mandar(texto);
        }}
        className="px-5 pt-3 pb-4 border-t border-gray-200 bg-white"
      >
        <label htmlFor="mensaje-pit" className="sr-only">Mensaje para Pit</label>
        <div className="flex gap-2 items-center border-[1.5px] border-gray-300 focus-within:border-orange-500 rounded-xl pl-4 pr-1.5 py-1.5">
          <input
            id="mensaje-pit"
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={500}
            disabled={!conVehiculo}
            autoFocus={autoFocus && conVehiculo}
            autoComplete="off"
            placeholder={conVehiculo ? "Escribí qué le pasa a tu auto…" : "Primero elegí tu vehículo"}
            className="flex-1 min-w-0 text-base md:text-sm outline-hidden bg-transparent disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            aria-label="Enviar"
            disabled={!conVehiculo || pensando || texto.trim().length < 3}
            className="w-11 h-11 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 text-white flex items-center justify-center shrink-0"
          >
            <IconoEnviar className="w-5 h-5" />
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">Pit orienta: no reemplaza la revisión de un mecánico.</p>
      </form>
    </div>
  );
}

function BurbujaPit({ children, className = "", ancla = false }) {
  return (
    <div
      data-ancla={ancla || undefined}
      className={`self-start max-w-[90%] bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed motion-safe:animate-aparecer ${className}`}
    >
      {children}
    </div>
  );
}

function Opciones({ titulo, opciones, onElegir }) {
  return (
    <div role="group" aria-label={titulo} className="flex flex-wrap gap-2 motion-safe:animate-aparecer">
      {opciones.map((opcion) => (
        <button
          key={opcion}
          type="button"
          onClick={() => onElegir(opcion)}
          className="min-h-9 px-4 rounded-full border border-orange-500 bg-white text-orange-700 text-sm font-bold hover:bg-orange-50 transition"
        >
          {opcion}
        </button>
      ))}
    </div>
  );
}

/** Los pasos que va haciendo mientras espera la respuesta. */
function Pensando({ nombreVehiculo }) {
  const [paso, setPaso] = useState(0);
  const pasos = ["Analizando el síntoma", `Buscando repuestos para tu ${nombreVehiculo}`, "Revisando el stock"];

  useEffect(() => {
    const timers = PASOS_MS.map((ms, i) => setTimeout(() => setPaso(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div role="status" className="self-start bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 flex flex-col gap-2 text-sm motion-safe:animate-aparecer">
      <span className="sr-only">Pit está pensando.</span>
      {pasos.map((texto, i) => (
        <span
          key={texto}
          aria-hidden="true"
          className={`flex items-center gap-2 ${i < paso ? "text-gray-600" : i === paso ? "font-bold" : "text-gray-400"}`}
        >
          {i < paso ? (
            <IconoCheck className="w-4 h-4 text-green-600" />
          ) : i === paso ? (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-orange-200 border-t-orange-500 motion-safe:animate-spin" />
          ) : (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-200" />
          )}
          {texto}
          {i === paso && "…"}
        </span>
      ))}
    </div>
  );
}

function RespuestaPit({ mensaje, ancla, nombreVehiculo, onAgregar, onAgregarTodos, onDetalle, onBuscarEnCatalogo }) {
  const { respuesta, consulta } = mensaje;
  const urgencia = URGENCIAS[respuesta.urgencia];

  // "Agregar todo": el primero con stock de cada tipo recomendado.
  const paraAgregarTodos = respuesta.recomendaciones
    .map((recomendacion) => recomendacion.repuestos.find((producto) => producto.stock > 0))
    .filter(Boolean);
  const totalTodos = paraAgregarTodos.reduce((suma, producto) => suma + Number(producto.precio || 0), 0);

  return (
    <BurbujaPit ancla={ancla} className="self-stretch max-w-none flex flex-col gap-3">
      {!respuesta.fueraDeTema && respuesta.urgencia === "alta" && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex gap-2.5">
          <IconoAlerta className="w-5 h-5 text-red-700 shrink-0" />
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-red-700">Urgencia alta</p>
            {respuesta.aviso && <p className="text-sm text-red-800 mt-0.5">{respuesta.aviso}</p>}
          </div>
        </div>
      )}
      {!respuesta.fueraDeTema && urgencia && (
        <span className={`self-start text-xs font-black border rounded-full px-3 py-1 ${urgencia.clase}`}>{urgencia.texto}</span>
      )}

      <p>{respuesta.diagnostico}</p>

      {!respuesta.fueraDeTema && respuesta.recomendaciones.length === 0 && (
        <p className="text-gray-600">
          No encontré repuestos de esos tipos para tu {nombreVehiculo}.{" "}
          <button type="button" onClick={() => onBuscarEnCatalogo?.(consulta)} className="font-bold text-orange-700 hover:underline">
            Buscar en el catálogo
          </button>
        </p>
      )}

      {respuesta.recomendaciones.map((recomendacion) => (
        <section key={recomendacion.tipo} aria-label={recomendacion.tipo} className="flex flex-col gap-2">
          <div>
            <h3 className="text-sm font-black">{recomendacion.tipo}</h3>
            <p className="text-xs text-gray-600 mt-0.5">{recomendacion.motivo}</p>
          </div>
          <div className="flex gap-3 overflow-x-auto snap-x pb-1">
            {recomendacion.repuestos.map((producto) => (
              <TarjetaRepuesto key={producto.id} producto={producto} onAgregar={onAgregar} onDetalle={onDetalle} />
            ))}
          </div>
        </section>
      ))}

      {paraAgregarTodos.length >= 2 && (
        <button
          type="button"
          onClick={() => onAgregarTodos(paraAgregarTodos)}
          className="h-12 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-black flex items-center justify-center gap-2"
        >
          <IconoCarrito className="w-5 h-5" />
          Agregar los {paraAgregarTodos.length} al carrito · {precio(totalTodos)}
        </button>
      )}

      {respuesta.pregunta && (
        <p>
          <span className="font-bold">Para afinar:</span> {respuesta.pregunta}
        </p>
      )}
    </BurbujaPit>
  );
}

function TarjetaRepuesto({ producto, onAgregar, onDetalle }) {
  const conStock = producto.stock > 0;
  return (
    <article className="snap-start shrink-0 w-[176px] border border-gray-200 rounded-xl overflow-hidden bg-white flex flex-col">
      <button type="button" onClick={() => onDetalle?.(producto)} className="h-24 bg-white" aria-label={`Ver detalle de ${producto.nombre}`}>
        <img src={producto.imagen} alt="" className="w-full h-full object-contain p-2" />
      </button>
      <div className="p-3 flex flex-col flex-1">
        <p className="text-[11px] font-black uppercase text-orange-700">{producto.fabricante}</p>
        <p className="text-sm font-bold leading-snug mt-0.5">{producto.nombre}</p>
        <div className="mt-auto pt-2 flex items-baseline justify-between gap-2">
          <span className="text-base font-black">{precio(producto.precio)}</span>
          <span className={`text-[11px] font-bold ${conStock ? "text-green-700" : "text-red-600"}`}>
            {conStock ? `${producto.stock} en stock` : "Sin stock"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onAgregar(producto)}
          disabled={!conStock}
          aria-label={`Agregar ${producto.nombre} al carrito`}
          className="mt-2 h-9 rounded-lg bg-[#151719] hover:bg-black disabled:bg-gray-200 disabled:text-gray-500 text-white text-xs font-black"
        >
          Agregar
        </button>
      </div>
    </article>
  );
}

function ErrorPit({ mensaje, ancla, onBuscarEnCatalogo }) {
  const { error, consulta } = mensaje;
  // Con el límite diario o la sesión vencida, buscar no ayuda; con un
  // historial rechazado (400), alcanza con seguir escribiendo.
  const ofrecerBusqueda = ![400, 401, 429].includes(error.status);

  return (
    <BurbujaPit ancla={ancla} className="border-red-200 bg-red-50">
      <p role="alert" className="font-bold text-red-700">{error.mensaje}</p>
      {ofrecerBusqueda && (
        <button
          type="button"
          onClick={() => onBuscarEnCatalogo?.(consulta)}
          className="mt-3 h-10 px-4 rounded-lg bg-white border border-gray-300 hover:border-orange-500 text-sm font-black"
        >
          Buscar "{consulta}" en el catálogo
        </button>
      )}
    </BurbujaPit>
  );
}
