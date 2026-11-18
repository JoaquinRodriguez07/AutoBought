/**
 * El texto de los términos y condiciones, compartido por la página
 * /terminos y la ventana que se abre desde el registro.
 *
 * AutoBought es un proyecto académico: lo primero que tiene que quedar
 * claro es que no se venden productos reales y que los pagos son de
 * prueba. También explica qué datos se guardan y cómo funcionan las
 * herramientas con IA (Pit y el dashboard del vendedor).
 */

const SECTIONS = [
  {
    title: "Es un proyecto académico",
    paragraphs: [
      "AutoBought es un trabajo de la materia Ingeniería de Software II. No es una tienda real: los repuestos, los precios, el stock y los pedidos son de prueba.",
      "No se vende ni se envía ningún producto, y no hay un comercio detrás que responda por las compras.",
    ],
  },
  {
    title: "Los pagos son de prueba",
    paragraphs: [
      "El pago usa el modo de prueba de Mercado Pago: no se cobra dinero real.",
      "No ingreses nunca los datos de una tarjeta real. Para probar, usá las tarjetas de prueba que publica Mercado Pago. Si igual ingresás una tarjeta real, el equipo no se hace responsable.",
    ],
  },
  {
    title: "Tus datos",
    paragraphs: [
      "Para usar la tienda guardamos lo que cargás: tu nombre, tu correo, tu teléfono, tus direcciones, tu carrito, tus favoritos y tus pedidos de prueba.",
      "Se usan solo para que la tienda funcione y para mandarte los mails de tu cuenta y de tus pedidos. Los mails de ofertas y recordatorios los podés apagar desde «Notificaciones» o desde el enlace que viene en cada uno.",
      "Podés borrar tu cuenta cuando quieras desde «Mi cuenta». Tus datos personales se borran, y los pedidos quedan sin tu nombre.",
      "Te recomendamos no cargar datos sensibles: es un entorno de prueba.",
    ],
  },
  {
    title: "Pit y las herramientas con IA",
    paragraphs: [
      "Pit, el asistente, y el resumen y las respuestas del dashboard del vendedor se generan con inteligencia artificial (Gemini, de Google). Lo que escribís se envía a ese servicio para armar la respuesta.",
      "Las respuestas pueden equivocarse. Pit orienta, pero no reemplaza la revisión de un mecánico: ante una falla que afecte la seguridad (por ejemplo, los frenos), llevá el auto a revisar.",
      "Hay un límite de consultas por usuario para que el servicio no se use de más.",
    ],
  },
  {
    title: "Uso de la tienda",
    paragraphs: [
      "La tienda se ofrece tal como está, para probarla. Puede tener errores, cambiar o dejar de estar disponible sin aviso.",
      "Al crear una cuenta aceptás estas condiciones.",
    ],
  },
];

export default function TermsContent({ headingLevel = 2 }) {
  const Heading = `h${headingLevel}`;
  return (
    <>
      <p role="note" className="rounded-xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm text-orange-800">
        <strong>Proyecto académico.</strong> No se venden productos reales y los pagos son de prueba:
        no ingreses una tarjeta real.
      </p>

      {SECTIONS.map((section) => (
        <section key={section.title} className="mt-6">
          <Heading className="text-base font-black">{section.title}</Heading>
          {section.paragraphs.map((text) => (
            <p key={text} className="mt-2 text-sm text-gray-700 leading-relaxed">
              {text}
            </p>
          ))}
        </section>
      ))}
    </>
  );
}
