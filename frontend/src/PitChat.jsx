// El chat con Pit, el asistente de compra con IA.

import { useEffect, useRef, useState } from "react";
import { useGenericImage } from "./mapPart";
import toast from "react-hot-toast";

import PitVehiclePicker from "./PitVehiclePicker";
import { AlertIcon, CartIcon, CloseIcon, CheckIcon, SendIcon, PitIcon } from "./Icons";
import { useCart } from "./context/CartContext";
import { isVehicleComplete } from "./context/VehicleContext";

const EXAMPLES = [
  "Chilla cuando freno",
  "Le cuesta arrancar a la mañana",
  "Se recalienta en el tráfico",
  "Las luces alumbran poco de noche",
];

const URGENCIES = {
  media: { texto: "Conviene resolverlo pronto", clase: "bg-amber-50 text-amber-800 border-amber-200" },
  removal: { texto: "Mantenimiento", clase: "bg-green-50 text-green-800 border-green-200" },
};

// Cuándo pasa cada paso de "pensando". Son aproximados: el backend hace
// todo en un solo pedido, pero estos son los pasos que hace de verdad.
const STEPS_MS = [1500, 3500];

const price = (rawValue) => `$${Number(rawValue || 0).toLocaleString("es-UY")}`;

/**
 * ChatPit
 * ==========================================
 * La conversación con Pit, el asistente con IA. Solo dibuja: la lógica
 * (mensajes, historial firmado, errores) está en useConversacionPit, que
 * llega por `conversacion`. Ocupa todo el alto de su contenedor: el panel
 * lateral (PanelPit), que le pasa `onCerrar`.
 */
export default function PitChat({
  vehicle,
  conversation,
  onDetail,
  onActivateVehicle,
  onSearchInCatalogo,
  onClose,
  autoFocus = false,
  initialText = "",
}) {
  const { messages, thinking, send, reset } = conversation;
  const { addToCart } = useCart();
  // Puede venir ya escrito (lo que el cliente buscó en el catálogo).
  const [texto, setText] = useState(initialText);
  const [changingCar, setChangingCar] = useState(false);
  const list = useRef(null);

  const withVehicle = isVehicleComplete(vehicle);
  const vehicleName = withVehicle ? `${vehicle.brand} ${vehicle.model} ${vehicle.year}` : "";
  const last = messages.at(-1);

  const chooseCar = (newItem) => {
    onActivateVehicle?.(newItem);
    setChangingCar(false);
  };

  // Lo nuevo queda a la vista. Una respuesta de Pit se muestra desde su
  // comienzo (urgencia y diagnóstico, lo más importante) aunque sea larga;
  // lo demás (el mensaje del cliente, "pensando"), al final.
  useEffect(() => {
    const contenedor = list.current;
    if (!contenedor) return;
    const ancla = !thinking && last?.rol === "pit" ? contenedor.querySelector("[data-ancla]") : null;
    contenedor.scrollTop = ancla ? ancla.offsetTop - 16 : contenedor.scrollHeight;
  }, [last, thinking]);

  const submit = (content) => {
    if (content.trim().length < 3 || thinking) return;
    send(content);
    setText("");
  };

  const add = async (product) => {
    // El aviso de "agregado al carrito" lo muestra CartContext, igual que
    // en el resto del sitio (aparece por encima del panel).
    await addToCart(product, 1);
  };

  const addAll = async (products) => {
    let added = 0;
    for (const product of products) {
      // Sin el aviso de cada uno: al final, uno solo con el total.
      if (await addToCart(product, 1, { aviso: false })) added += 1;
    }
    if (added > 0) {
      toast.success(added === 1 ? "Agregamos 1 repuesto al carrito." : `Agregamos ${added} repuestos al carrito.`);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">

      {/* Encabezado */}
      <div className="bg-[#151719] text-white px-5 py-4 flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
          <PitIcon className="w-6 h-6" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-base font-black leading-tight">Pit</p>
          <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" aria-hidden="true" />
            <span className="truncate">Te acompaño en tu pit stop</span>
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={reset}
            aria-label="Nueva conversación"
            className="h-11 px-3 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 transition shrink-0"
          >
            Nueva charla
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar Pit"
            className="w-11 h-11 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition shrink-0"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      {withVehicle && !changingCar && (
        <div className="px-5 py-2.5 border-b border-gray-200 bg-white flex items-center justify-between text-sm">
          <span className="font-bold">{vehicleName}</span>
          <button type="button" onClick={() => setChangingCar(true)} className="font-bold text-orange-700 hover:underline">
            Cambiar
          </button>
        </div>
      )}
      {withVehicle && changingCar && (
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
          <PitVehiclePicker
            vehicle={vehicle}
            onReady={chooseCar}
            onCancel={() => setChangingCar(false)}
            aviso={messages.length > 0 ? "Si cambiás de auto, la charla empieza de nuevo." : null}
          />
        </div>
      )}

      {/* Mensajes */}
      <div ref={list} role="log" aria-label="Conversación con Pit" className="relative flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        {!withVehicle ? (
          <>
            <PitBubble>
              ¡Hola! Soy Pit, tu mecánico con IA, y te acompaño en este pit stop. Para recomendarte solo repuestos
              que le sirvan, primero decime qué auto tenés.
            </PitBubble>
            <PitVehiclePicker vehicle={vehicle} onReady={chooseCar} />
          </>
        ) : (
          <>
            <PitBubble>
              ¡Hola! Soy Pit, tu mecánico con IA, y te acompaño en este pit stop. Contame con tus palabras qué
              le pasa a tu {vehicle.model} y te digo qué revisar.
            </PitBubble>
            {messages.length === 0 && (
              <Options title="Por ejemplo" opciones={EXAMPLES} onChoose={submit} />
            )}
          </>
        )}

        {messages.map((message) =>
          message.rol === "cliente" ? (
            <p
              key={message.id}
              className="self-end max-w-[85%] bg-orange-500 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm whitespace-pre-wrap motion-safe:animate-aparecer"
            >
              {message.texto}
            </p>
          ) : message.error ? (
            <PitError key={message.id} message={message} ancla={message === last} onSearchInCatalogo={onSearchInCatalogo} />
          ) : (
            <PitAnswer
              key={message.id}
              message={message}
              ancla={message === last}
              vehicleName={vehicleName}
              onAdd={add}
              onAddAll={addAll}
              onDetail={onDetail}
              onSearchInCatalogo={onSearchInCatalogo}
            />
          )
        )}

        {thinking && <Thinking vehicleName={vehicleName} />}

        {/* Las respuestas rápidas son solo para la última pregunta. */}
        {!thinking && last?.response?.opciones?.length > 0 && (
          <Options title="Respuestas rápidas" opciones={last.response.opciones} onChoose={submit} />
        )}
      </div>

      {/* Escribir */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(texto);
        }}
        className="px-5 pt-3 pb-4 border-t border-gray-200 bg-white"
      >
        <label htmlFor="mensaje-pit" className="sr-only">Mensaje para Pit</label>
        <div className="flex gap-2 items-center border-[1.5px] border-gray-300 focus-within:border-orange-500 rounded-xl pl-4 pr-1.5 py-1.5">
          <input
            id="mensaje-pit"
            type="text"
            value={texto}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            disabled={!withVehicle}
            autoFocus={autoFocus && withVehicle}
            autoComplete="off"
            placeholder={withVehicle ? "Escribí qué le pasa a tu auto…" : "Primero elegí tu vehículo"}
            className="flex-1 min-w-0 text-base md:text-sm outline-hidden bg-transparent disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            aria-label="Enviar"
            disabled={!withVehicle || thinking || texto.trim().length < 3}
            className="w-11 h-11 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 text-white flex items-center justify-center shrink-0"
          >
            <SendIcon className="w-5 h-5" />
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">Pit orienta: no reemplaza la revisión de un mecánico.</p>
      </form>
    </div>
  );
}

function PitBubble({ children, className = "", ancla = false }) {
  return (
    <div
      data-ancla={ancla || undefined}
      className={`self-start max-w-[90%] bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed motion-safe:animate-aparecer ${className}`}
    >
      {children}
    </div>
  );
}

function Options({ title, opciones, onChoose }) {
  return (
    <div role="group" aria-label={title} className="flex flex-wrap gap-2 motion-safe:animate-aparecer">
      {opciones.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChoose(option)}
          className="min-h-9 px-4 rounded-full border border-orange-500 bg-white text-orange-700 text-sm font-bold hover:bg-orange-50 transition"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/** Los pasos que va haciendo mientras espera la respuesta. */
function Thinking({ vehicleName }) {
  const [step, setStep] = useState(0);
  const steps = ["Analizando el síntoma", `Buscando repuestos para tu ${vehicleName}`, "Revisando el stock"];

  useEffect(() => {
    const timers = STEPS_MS.map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div role="status" className="self-start bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 flex flex-col gap-2 text-sm motion-safe:animate-aparecer">
      <span className="sr-only">Pit está pensando.</span>
      {steps.map((texto, i) => (
        <span
          key={texto}
          aria-hidden="true"
          className={`flex items-center gap-2 ${i < step ? "text-gray-600" : i === step ? "font-bold" : "text-gray-400"}`}
        >
          {i < step ? (
            <CheckIcon className="w-4 h-4 text-green-600" />
          ) : i === step ? (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-orange-200 border-t-orange-500 motion-safe:animate-spin" />
          ) : (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-200" />
          )}
          {texto}
          {i === step && "…"}
        </span>
      ))}
    </div>
  );
}

function PitAnswer({ message, ancla, vehicleName, onAdd, onAddAll, onDetail, onSearchInCatalogo }) {
  const { response, queryState } = message;
  const urgencia = URGENCIES[response.urgencia];

  // "Agregar todo": el primero con stock de cada tipo recomendado.
  const forAddAll = response.recomendaciones
    .map((recomendacion) => recomendacion.repuestos.find((product) => product.stock > 0))
    .filter(Boolean);
  const totalAll = forAddAll.reduce((sum, product) => sum + Number(product.price || 0), 0);

  return (
    <PitBubble ancla={ancla} className="self-stretch max-w-none flex flex-col gap-3">
      {!response.offTopic && response.urgencia === "alta" && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex gap-2.5">
          <AlertIcon className="w-5 h-5 text-red-700 shrink-0" />
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-red-700">Urgencia alta</p>
            {response.aviso && <p className="text-sm text-red-800 mt-0.5">{response.aviso}</p>}
          </div>
        </div>
      )}
      {!response.offTopic && urgencia && (
        <span className={`self-start text-xs font-black border rounded-full px-3 py-1 ${urgencia.clase}`}>{urgencia.texto}</span>
      )}

      <p>{response.diagnostico}</p>

      {!response.offTopic && response.recomendaciones.length === 0 && (
        <p className="text-gray-600">
          No encontré repuestos de esos tipos para tu {vehicleName}.{" "}
          <button type="button" onClick={() => onSearchInCatalogo?.(queryState)} className="font-bold text-orange-700 hover:underline">
            Buscar en el catálogo
          </button>
        </p>
      )}

      {response.recomendaciones.map((recomendacion) => (
        <section key={recomendacion.tipo} aria-label={recomendacion.tipo} className="flex flex-col gap-2">
          <div>
            <h3 className="text-sm font-black">{recomendacion.tipo}</h3>
            <p className="text-xs text-gray-600 mt-0.5">{recomendacion.motivo}</p>
          </div>
          <div className="flex gap-3 overflow-x-auto snap-x pb-1">
            {recomendacion.repuestos.map((product) => (
              <PartCard key={product.id} product={product} onAdd={onAdd} onDetail={onDetail} />
            ))}
          </div>
        </section>
      ))}

      {forAddAll.length >= 2 && (
        <button
          type="button"
          onClick={() => onAddAll(forAddAll)}
          className="h-12 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-black flex items-center justify-center gap-2"
        >
          <CartIcon className="w-5 h-5" />
          Agregar los {forAddAll.length} al carrito · {price(totalAll)}
        </button>
      )}

      {response.pregunta && (
        <p>
          <span className="font-bold">Para afinar:</span> {response.pregunta}
        </p>
      )}
    </PitBubble>
  );
}

function PartCard({ product, onAdd, onDetail }) {
  const withStock = product.stock > 0;
  return (
    <article className="snap-start shrink-0 w-[176px] border border-gray-200 rounded-xl overflow-hidden bg-white flex flex-col">
      <button type="button" onClick={() => onDetail?.(product)} className="h-24 bg-white" aria-label={`Ver detalle de ${product.displayName}`}>
        <img onError={useGenericImage} src={product.image} alt="" className="w-full h-full object-contain p-2" />
      </button>
      <div className="p-3 flex flex-col flex-1">
        <p className="text-xs font-black uppercase text-orange-700">{product.fabricante}</p>
        <p className="text-sm font-bold leading-snug mt-0.5">{product.displayName}</p>
        <div className="mt-auto pt-2 flex items-baseline justify-between gap-2">
          <span className="text-base font-black">{price(product.price)}</span>
          <span className={`text-xs font-bold ${withStock ? "text-green-700" : "text-red-600"}`}>
            {withStock ? `${product.stock} en stock` : "Sin stock"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onAdd(product)}
          disabled={!withStock}
          aria-label={`Agregar ${product.displayName} al carrito`}
          className="mt-2 h-9 rounded-lg bg-[#151719] hover:bg-black disabled:bg-gray-200 disabled:text-gray-500 text-white text-sm font-bold"
        >
          Agregar
        </button>
      </div>
    </article>
  );
}

function PitError({ message, ancla, onSearchInCatalogo }) {
  const { error, queryState } = message;
  // Con el límite diario o la sesión vencida, buscar no ayuda; con un
  // historial rechazado (400), alcanza con seguir escribiendo.
  const offerSearch = ![400, 401, 429].includes(error.status);

  return (
    <PitBubble ancla={ancla} className="border-red-200 bg-red-50">
      <p role="alert" className="font-bold text-red-700">{error.message}</p>
      {offerSearch && (
        <button
          type="button"
          onClick={() => onSearchInCatalogo?.(queryState)}
          className="mt-3 h-10 px-4 rounded-lg bg-white border border-gray-300 hover:border-orange-500 text-sm font-black"
        >
          Buscar "{queryState}" en el catálogo
        </button>
      )}
    </PitBubble>
  );
}
