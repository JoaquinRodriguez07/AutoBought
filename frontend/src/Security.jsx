import ChangePassword from "./ChangePassword";
import AccountLayout from "./AccountLayout";

/** "Seguridad" (/seguridad): cambiar la contraseña. */
export default function Security(propsNavbar) {
  return (
    <AccountLayout
      {...propsNavbar}
      section="seguridad"
      title="Seguridad"
      description="La contraseña con la que entrás a tu cuenta."
    >
      <ChangePassword email={propsNavbar.sessionUser?.email} />
    </AccountLayout>
  );
}
