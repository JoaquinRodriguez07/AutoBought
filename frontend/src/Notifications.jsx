import AccountLayout from "./AccountLayout";
import MailPreferences from "./MailPreferences";

/** "Notificaciones" (/notificaciones): qué mails recibe el cliente. */
export default function Notifications({ onActualizarUsuario, ...propsNavbar }) {
  return (
    <AccountLayout
      {...propsNavbar}
      seccion="notificaciones"
      titulo="Notificaciones"
      descripcion="Lo que te mandamos por mail."
    >
      <MailPreferences usuario={propsNavbar.usuario} onActualizarUsuario={onActualizarUsuario} />
    </AccountLayout>
  );
}
