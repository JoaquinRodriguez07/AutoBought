import AccountLayout from "./AccountLayout";
import MailPreferences from "./MailPreferences";

/** "Notificaciones" (/notificaciones): qué mails recibe el cliente. */
export default function Notifications({ onUpdateUser, ...propsNavbar }) {
  return (
    <AccountLayout
      {...propsNavbar}
      section="notificaciones"
      title="Notificaciones"
      description="Lo que te mandamos por mail."
    >
      <MailPreferences sessionUser={propsNavbar.sessionUser} onUpdateUser={onUpdateUser} />
    </AccountLayout>
  );
}
