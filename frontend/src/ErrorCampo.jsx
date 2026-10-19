import { idError } from "./erroresCampo";

// Mensaje de error debajo de un campo de formulario.
export default function ErrorCampo({ campo, mensaje }) {
  if (!mensaje) return null;
  return (
    <p id={idError(campo)} className="text-red-500 text-[9px] mt-1">
      {mensaje}
    </p>
  );
}
