/**
 * Iconos
 * ==========================================
 * Íconos simples en SVG, en lugar de emojis: se ven igual en todos los
 * sistemas y toman el color del texto (`currentColor`). Son decorativos
 * (`aria-hidden`): el botón que los contiene lleva su propio nombre
 * accesible.
 */

function Icono({ className = "w-4 h-4", children, relleno = "none" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={relleno}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function IconoLupa(props) {
  return (
    <Icono {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icono>
  );
}

export function IconoCerrar(props) {
  return (
    <Icono {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icono>
  );
}

export function IconoCarrito(props) {
  return (
    <Icono {...props}>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" />
    </Icono>
  );
}

export function IconoCorazon({ lleno = false, ...props }) {
  return (
    <Icono {...props} relleno={lleno ? "currentColor" : "none"}>
      <path d="M12 20s-7-4.4-9.2-8.6C1.2 8.3 3 4.5 6.6 4.5c2 0 3.4 1.1 4.4 2.6 1-1.5 2.4-2.6 4.4-2.6 3.6 0 5.4 3.8 3.8 6.9C19 15.6 12 20 12 20Z" />
    </Icono>
  );
}

export function IconoAuto(props) {
  return (
    <Icono {...props}>
      <path d="M5 16H3v-4l2-5h14l2 5v4h-2" />
      <path d="M3 12h18" />
      <circle cx="7.5" cy="16.5" r="1.5" />
      <circle cx="16.5" cy="16.5" r="1.5" />
      <path d="M9 16.5h6" />
    </Icono>
  );
}

export function IconoFiltros(props) {
  return (
    <Icono {...props}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </Icono>
  );
}

export function IconoFlecha(props) {
  return (
    <Icono {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icono>
  );
}

export function IconoEscudo(props) {
  return (
    <Icono {...props}>
      <path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </Icono>
  );
}

export function IconoCamion(props) {
  return (
    <Icono {...props}>
      <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" />
      <circle cx="7" cy="17.5" r="1.5" />
      <circle cx="17" cy="17.5" r="1.5" />
    </Icono>
  );
}
