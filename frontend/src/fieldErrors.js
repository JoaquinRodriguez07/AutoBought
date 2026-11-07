// Ayudas para mostrar el error de un campo de formulario (ver ErrorCampo.jsx).
// El input lo referencia con aria-describedby={idError(campo)} y aria-invalid.

export const errorId = (field) => `error-${field}`;

/** Cambia el borde gris del input por uno rojo si el campo tiene error. */
export const withError = (clase, message) =>
  message ? clase.replace("border-gray-200", "border-red-400") : clase;

/** Props de accesibilidad para el input de un campo. */
export const errorProps = (field, message) => ({
  "aria-invalid": message ? true : undefined,
  "aria-describedby": message ? errorId(field) : undefined,
});
