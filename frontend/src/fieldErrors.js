// Ayudas para mostrar el error de un campo de formulario (ver ErrorCampo.jsx).
// El input lo referencia con aria-describedby={idError(campo)} y aria-invalid.

export const errorId = (campo) => `error-${campo}`;

/** Cambia el borde gris del input por uno rojo si el campo tiene error. */
export const withError = (clase, mensaje) =>
  mensaje ? clase.replace("border-gray-200", "border-red-400") : clase;

/** Props de accesibilidad para el input de un campo. */
export const errorProps = (campo, mensaje) => ({
  "aria-invalid": mensaje ? true : undefined,
  "aria-describedby": mensaje ? errorId(campo) : undefined,
});
