import { esAdmin } from "../auth";
import { VISTAS } from "./LayoutVendedor";

/** Las secciones que puede ver este vendedor (sin "Equipo" si no es administrador). */
export function vistasDe(usuario) {
  const admin = esAdmin(usuario);
  return VISTAS.filter((vista) => !vista.soloAdmin || admin);
}
