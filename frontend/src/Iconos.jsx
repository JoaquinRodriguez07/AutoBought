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

export function IconoMenu(props) {
  return (
    <Icono {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
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

export function IconoUsuario(props) {
  return (
    <Icono {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </Icono>
  );
}

export function IconoUbicacion(props) {
  return (
    <Icono {...props}>
      <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </Icono>
  );
}

export function IconoTarjeta(props) {
  return (
    <Icono {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19M6.5 15h4" />
    </Icono>
  );
}

export function IconoCaja(props) {
  return (
    <Icono {...props}>
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" />
      <path d="m3 7.5 9 4.5 9-4.5M12 12v9" />
    </Icono>
  );
}

export function IconoSalir(props) {
  return (
    <Icono {...props}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l-5-5 5-5M5 12h11" />
    </Icono>
  );
}

export function IconoCheck(props) {
  return (
    <Icono {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icono>
  );
}

export function IconoBasura(props) {
  return (
    <Icono {...props}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </Icono>
  );
}

export function IconoCandado(props) {
  return (
    <Icono {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Icono>
  );
}

// ---- Categorías del catálogo (ver iconoDeCategoria en Home.jsx) ----

export function IconoEscobilla(props) {
  return (
    <Icono {...props}>
      <path d="M4 20 18 6M18 6l2 2M14 10l-6-6M9 15l-5-5" />
    </Icono>
  );
}

export function IconoRayo(props) {
  return (
    <Icono {...props}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </Icono>
  );
}

export function IconoChispa(props) {
  return (
    <Icono {...props}>
      <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
      <circle cx="12" cy="12" r="2.5" />
    </Icono>
  );
}

export function IconoFiltro(props) {
  return (
    <Icono {...props}>
      <path d="M3 4h18l-7 8v6l-4 2v-8L3 4Z" />
    </Icono>
  );
}

export function IconoDisco(props) {
  return (
    <Icono {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </Icono>
  );
}

export function IconoGota(props) {
  return (
    <Icono {...props}>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
    </Icono>
  );
}

export function IconoEngranaje(props) {
  return (
    <Icono {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      <circle cx="12" cy="12" r="7" />
    </Icono>
  );
}

export function IconoTermometro(props) {
  return (
    <Icono {...props}>
      <path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z" />
      <path d="M12 9v6" />
    </Icono>
  );
}

export function IconoResorte(props) {
  return (
    <Icono {...props}>
      <path d="M6 3h12M6 21h12M7 6l10 3M7 9l10 3M7 12l10 3M7 15l10 3" />
    </Icono>
  );
}

// Pit, el asistente con IA: una tuerca.
export function IconoPit(props) {
  return (
    <Icono {...props}>
      <path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" />
      <circle cx="12" cy="12" r="3.4" />
    </Icono>
  );
}

export function IconoEnviar(props) {
  return (
    <Icono {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icono>
  );
}

// Íconos de las categorías agregadas después (ver Home).

export function IconoCopoNieve(props) {
  return (
    <Icono {...props}>
      <path d="M12 2v20M4.9 7l14.2 10M4.9 17 19.1 7" />
      <path d="m9.5 3.5 2.5 2 2.5-2M9.5 20.5l2.5-2 2.5 2" />
    </Icono>
  );
}

export function IconoVolante(props) {
  return (
    <Icono {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M3.5 10.5h6M14.5 10.5h6M12 14.5V21" />
    </Icono>
  );
}

export function IconoEscape(props) {
  return (
    <Icono {...props}>
      <path d="M2 9h7v6H2" />
      <rect x="9" y="7" width="9" height="10" rx="2" />
      <path d="M18 12h3" />
      <path d="M21.5 9.5c.5.8.5 1.7 0 2.5M21.5 12c.5.8.5 1.7 0 2.5" />
    </Icono>
  );
}

export function IconoCambios(props) {
  return (
    <Icono {...props}>
      <circle cx="5" cy="5" r="1.5" />
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="19" cy="5" r="1.5" />
      <circle cx="5" cy="19" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
      <path d="M5 6.5v11M12 6.5v11M19 6.5V12H5" />
    </Icono>
  );
}

export function IconoAlerta(props) {
  return (
    <Icono {...props}>
      <path d="M12 3l9.5 17h-19z" />
      <path d="M12 10v4M12 17.5v.5" />
    </Icono>
  );
}
