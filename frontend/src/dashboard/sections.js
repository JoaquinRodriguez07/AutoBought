import { isAdmin } from "../auth";
import { VIEWS } from "./SellerLayout";

/** Las secciones que puede ver este vendedor (sin "Equipo" si no es administrador). */
export function viewsFor(sessionUser) {
  const admin = isAdmin(sessionUser);
  return VIEWS.filter((vista) => !vista.onlyAdmin || admin);
}
