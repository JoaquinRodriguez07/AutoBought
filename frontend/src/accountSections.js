import { BoxIcon, LockIcon, EnvelopeIcon, LocationIcon, UserIcon } from "./Icons";

// Las secciones de "Mi cuenta", en el orden del menú. `ruta` es adonde
// lleva cada una; `descripcion` se ve en el inicio de la cuenta (/cuenta).
export const ACCOUNT_SECTIONS = [
  {
    key: "purchases",
    texto: "Mis compras",
    description: "Seguí tus pedidos y mirá tus compras anteriores.",
    Icon: BoxIcon,
    route: "/pedidos",
  },
  {
    key: "info",
    texto: "Mis datos",
    description: "Tu nombre, tu correo y tu teléfono.",
    Icon: UserIcon,
    route: "/perfil",
  },
  {
    key: "addresses",
    texto: "Direcciones",
    description: "Dónde recibís tus compras.",
    Icon: LocationIcon,
    route: "/direcciones",
  },
  {
    key: "seguridad",
    texto: "Seguridad",
    description: "Cambiá la contraseña con la que entrás.",
    Icon: LockIcon,
    route: "/seguridad",
  },
  {
    key: "notificaciones",
    texto: "Notificaciones",
    description: "Elegí qué mails querés recibir.",
    Icon: EnvelopeIcon,
    route: "/notificaciones",
  },
];
