import CambiarPassword from "./CambiarPassword";
import CuentaLayout from "./CuentaLayout";

/** "Seguridad" (/seguridad): cambiar la contraseña. */
export default function Seguridad(propsNavbar) {
  return (
    <CuentaLayout
      {...propsNavbar}
      seccion="seguridad"
      titulo="Seguridad"
      descripcion="La contraseña con la que entrás a tu cuenta."
    >
      <CambiarPassword email={propsNavbar.usuario?.email} />
    </CuentaLayout>
  );
}
