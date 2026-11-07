import { IconoCaja, IconoCandado, IconoSobre, IconoUbicacion, IconoUsuario } from "./Iconos";

// Las secciones de "Mi cuenta", en el orden del menú. `ruta` es adonde
// lleva cada una; `descripcion` se ve en el inicio de la cuenta (/cuenta).
export const SECCIONES_CUENTA = [
  {
    clave: "compras",
    texto: "Mis compras",
    descripcion: "Seguí tus pedidos y mirá tus compras anteriores.",
    Icono: IconoCaja,
    ruta: "/pedidos",
  },
  {
    clave: "datos",
    texto: "Mis datos",
    descripcion: "Tu nombre, tu correo y tu teléfono.",
    Icono: IconoUsuario,
    ruta: "/perfil",
  },
  {
    clave: "direcciones",
    texto: "Direcciones",
    descripcion: "Dónde recibís tus compras.",
    Icono: IconoUbicacion,
    ruta: "/direcciones",
  },
  {
    clave: "seguridad",
    texto: "Seguridad",
    descripcion: "Cambiá la contraseña con la que entrás.",
    Icono: IconoCandado,
    ruta: "/seguridad",
  },
  {
    clave: "notificaciones",
    texto: "Notificaciones",
    descripcion: "Elegí qué mails querés recibir.",
    Icono: IconoSobre,
    ruta: "/notificaciones",
  },
];
