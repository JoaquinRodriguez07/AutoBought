import { errorId } from "./fieldErrors";

// Mensaje de error debajo de un campo de formulario.
// `className` cambia el tamaño (las pantallas de acceso usan letra más grande).
export default function FieldError({ campo, mensaje, className = "text-xs mt-1" }) {
  if (!mensaje) return null;
  return (
    <p id={errorId(campo)} className={`text-red-500 ${className}`}>
      {mensaje}
    </p>
  );
}
