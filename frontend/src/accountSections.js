import { BoxIcon, LockIcon, EnvelopeIcon, LocationIcon, UserIcon } from "./Icons";

// Las secciones de "Mi cuenta", en el orden del menú. `ruta` es adonde
// lleva cada una; `descripcion` se ve en el inicio de la cuenta (/cuenta).
export const ACCOUNT_SECTIONS = [
  {
    clave: "compras",
    texto: "Mis compras",
    descripcion: "Seguí tus pedidos y mirá tus compras anteriores.",
    Icon: BoxIcon,
    ruta: "/pedidos",
  },
  {
    clave: "datos",
    texto: "Mis datos",
    descripcion: "Tu nombre, tu correo y tu teléfono.",
    Icon: UserIcon,
    ruta: "/perfil",
  },
  {
    clave: "direcciones",
    texto: "Direcciones",
    descripcion: "Dónde recibís tus compras.",
    Icon: LocationIcon,
    ruta: "/direcciones",
  },
  {
    clave: "seguridad",
    texto: "Seguridad",
    descripcion: "Cambiá la contraseña con la que entrás.",
    Icon: LockIcon,
    ruta: "/seguridad",
  },
  {
    clave: "notificaciones",
    texto: "Notificaciones",
    descripcion: "Elegí qué mails querés recibir.",
    Icon: EnvelopeIcon,
    ruta: "/notificaciones",
  },
];
