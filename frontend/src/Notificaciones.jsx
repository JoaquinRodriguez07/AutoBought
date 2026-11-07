import CuentaLayout from "./CuentaLayout";
import PreferenciasMails from "./PreferenciasMails";

/** "Notificaciones" (/notificaciones): qué mails recibe el cliente. */
export default function Notificaciones({ onActualizarUsuario, ...propsNavbar }) {
  return (
    <CuentaLayout
      {...propsNavbar}
      seccion="notificaciones"
      titulo="Notificaciones"
      descripcion="Lo que te mandamos por mail."
    >
      <PreferenciasMails usuario={propsNavbar.usuario} onActualizarUsuario={onActualizarUsuario} />
    </CuentaLayout>
  );
}
