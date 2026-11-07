import ChangePassword from "./ChangePassword";
import AccountLayout from "./AccountLayout";

/** "Seguridad" (/seguridad): cambiar la contraseña. */
export default function Security(propsNavbar) {
  return (
    <AccountLayout
      {...propsNavbar}
      seccion="seguridad"
      titulo="Seguridad"
      descripcion="La contraseña con la que entrás a tu cuenta."
    >
      <ChangePassword email={propsNavbar.usuario?.email} />
    </AccountLayout>
  );
}
