import { idError } from "./erroresCampo";

// Mensaje de error debajo de un campo de formulario.
// `className` cambia el tamaño (las pantallas de acceso usan letra más grande).
export default function ErrorCampo({ campo, mensaje, className = "text-[9px] mt-1" }) {
  if (!mensaje) return null;
  return (
    <p id={idError(campo)} className={`text-red-500 ${className}`}>
      {mensaje}
    </p>
  );
}
