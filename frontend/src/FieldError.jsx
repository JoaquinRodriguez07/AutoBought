import { errorId } from "./fieldErrors";

// Mensaje de error debajo de un campo de formulario.
// `className` cambia el tamaño (las pantallas de acceso usan letra más grande).
export default function FieldError({ field, message, className = "text-xs mt-1" }) {
  if (!message) return null;
  return (
    <p id={errorId(field)} className={`text-red-500 ${className}`}>
      {message}
    </p>
  );
}
