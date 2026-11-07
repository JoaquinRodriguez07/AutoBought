import { isAdmin } from "../auth";
import { VIEWS } from "./SellerLayout";

/** Las secciones que puede ver este vendedor (sin "Equipo" si no es administrador). */
export function viewsFor(usuario) {
  const admin = isAdmin(usuario);
  return VIEWS.filter((vista) => !vista.soloAdmin || admin);
}
