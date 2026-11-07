// Pantalla de registro de un cliente.

import { useState } from "react";
import { register as registerInApi } from "./api";
import { decodeToken } from "./auth";
import FieldError from "./FieldError";
import { withError, errorProps } from "./fieldErrors";
import { primaryButtonClass, fieldClass } from "./accessStyles";
import { passwordStrength } from "./passwordStrength";
import AccessScreen, { ErrorNotice, FormField, PasswordField, AccessHeader } from "./AccessScreen";
import { formatUyPhone, normalizeUyPhone } from "./phone";
import { NAME_MAX, clean, validateRegistration } from "./validations";

// Campos del backend → campos del formulario, para mostrar sus errores 422.
const API_FIELDS = { name: "displayName", email: "email", phone: "phone", password: "password" };

// Los errores de las pantallas de acceso, con letra legible.
const errorClass = "text-xs mt-1.5";

// Barrita de "qué tan segura es" debajo de la contraseña.
function StrengthMeter({ password }) {
  const fuerza = passwordStrength(password);
  if (!fuerza) return <span>Al menos 8 caracteres, con una letra y un número.</span>;
  return (
    <div aria-live="polite">
      <div className="grid grid-cols-4 gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((segmento) => (
          <span
            key={segmento}
            className={`h-1 rounded-full transition-colors ${segmento <= Math.max(fuerza.puntos, 1) ? fuerza.color : "bg-gray-200"}`}
          />
        ))}
      </div>
      <span className="mt-1 block">
        Seguridad: <strong className="text-gray-700">{fuerza.texto}</strong>
      </span>
    </div>
  );
}

export default function Register({
  onHome,
  onCatalogo,
  onLogin,
  onBrands,
  onCart,
  onFavorites,
  cartQuantity,
  favoritesQuantity,
  onRegistroExitoso,
}) {
  const [displayName, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptsTerms, setAcceptsTerms] = useState(false);

  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const values = { displayName, lastName, email, phone, password, confirmPassword, acceptsTerms };

  // Al salir de un campo con algo escrito se muestra su error, sin esperar
  // a "Crear cuenta".
  const revisar = (field) => () => {
    const rawValue = values[field];
    if (typeof rawValue === "string" && !rawValue.trim()) return;
    const found = validateRegistration(values)[field];
    setErrors((actuales) => ({ ...actuales, [field]: found }));
  };

  // Al editar un campo se borra su error.
  const change = (field, setter) => (e) => {
    setter(field === "terms" ? e.target.checked : e.target.value);
    setErrors((actuales) => ({ ...actuales, [field]: undefined }));
  };

  const register = async (e) => {
    e.preventDefault();
    setError("");

    const errorsForm = validateRegistration({
      displayName,
      lastName,
      email,
      phone,
      password,
      confirmPassword,
      acceptsTerms,
    });
    setErrors(errorsForm);
    if (Object.keys(errorsForm).length > 0) return;

    setLoading(true);

    try {
      const data = await registerInApi({
        displayName: clean(displayName),
        lastName: clean(lastName),
        email: email.trim(),
        phone: phone.trim(),
        password,
      });
      const payload = decodeToken(data.access_token);

      onRegistroExitoso({
        token: data.access_token,
        tokenType: data.token_type,
        userId: payload?.sub ?? null,
        userType: payload?.user_type ?? null,
        // Misma forma que devuelve obtenerPerfil() al iniciar sesión:
        // el backend guarda nombre + apellido en un solo campo.
        displayName: `${clean(displayName)} ${clean(lastName)}`,
        lastName: "",
        email: email.trim().toLowerCase(),
        phone: formatUyPhone(normalizeUyPhone(phone)),
        // Recién registrado: el mail de verificación acaba de salir.
        verifiedEmail: false,
      });
    } catch (err) {
      const fields = Object.fromEntries(
        Object.entries(err.fields || {})
          .filter(([field]) => API_FIELDS[field])
          .map(([field, message]) => [API_FIELDS[field], message])
      );
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setError(err.message || "No pudimos crear tu cuenta.");
    } finally {
      setLoading(false);
    }
  };

  const propsNavbar = {
    onHome,
    onCatalogo,
    onLogin,
    onBrands,
    onCart,
    onFavorites,
    cartQuantity,
    favoritesQuantity,
  };

  // Lo común a cada campo: valor, cambio, salida, borde y accesibilidad.
  const propsField = (field, rawValue, setter) => ({
    id: `registro-${field}`,
    value: rawValue,
    onChange: change(field, setter),
    onBlur: revisar(field),
    className: withError(fieldClass, errors[field]),
    ...errorProps(field, errors[field]),
  });

  const errorOf = (field) => <FieldError field={field} message={errors[field]} className={errorClass} />;

  return (
    <AccessScreen
      propsNavbar={propsNavbar}
      label="CREÁ TU CUENTA GRATIS"
      title={["Tu auto,", "siempre en", "movimiento."]}
      beneficios={[
        "Repuestos que le sirven a tu auto",
        "Seguimiento de cada pedido",
        "Avisos cuando vuelve el stock",
        "Recordatorios de mantenimiento",
      ]}
      ancho="max-w-[960px]"
    >
      <form onSubmit={register} noValidate>
        <AccessHeader title="CREAR CUENTA" drop="Registrate para comprar, seguir tus pedidos y guardar tus repuestos." />

        <ErrorNotice>{error}</ErrorNotice>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 mt-6">
          <FormField id="registro-displayName" label="Nombre" error={errorOf("displayName")}>
            <input type="text" placeholder="Tu nombre" maxLength={NAME_MAX} autoComplete="given-name" {...propsField("displayName", displayName, setName)} />
          </FormField>

          <FormField id="registro-lastName" label="Apellido" error={errorOf("lastName")}>
            <input type="text" placeholder="Tu apellido" maxLength={NAME_MAX} autoComplete="family-name" {...propsField("lastName", lastName, setLastName)} />
          </FormField>

          <FormField id="registro-email" label="Correo electrónico" error={errorOf("email")}>
            <input type="email" placeholder="tu@email.com" maxLength={254} autoComplete="email" {...propsField("email", email, setEmail)} />
          </FormField>

          <FormField id="registro-phone" label="Teléfono" error={errorOf("phone")}>
            <input type="tel" placeholder="099 123 456" maxLength={30} autoComplete="tel" {...propsField("phone", phone, setPhone)} />
          </FormField>

          <FormField
            id="registro-password"
            label="Contraseña"
            error={errors.password ? errorOf("password") : null}
            ayuda={<StrengthMeter password={password} />}
          >
            <PasswordField placeholder="Mínimo 8 caracteres" autoComplete="new-password" {...propsField("password", password, setPassword)} />
          </FormField>

          <FormField id="registro-confirmPassword" label="Confirmar contraseña" error={errorOf("confirmPassword")}>
            <PasswordField
              placeholder="Repetí tu contraseña"
              autoComplete="new-password"
              {...propsField("confirmPassword", confirmPassword, setConfirmPassword)}
            />
          </FormField>
        </div>

        <label className="flex items-start gap-2.5 mt-5 cursor-pointer select-none w-fit">
          <input
            type="checkbox"
            checked={acceptsTerms}
            onChange={change("terms", setAcceptsTerms)}
            className="w-4 h-4 mt-0.5 accent-orange-500"
            {...errorProps("terms", errors.terms)}
          />
          <span className="text-sm text-gray-600">Acepto los términos y condiciones.</span>
        </label>
        {errorOf("terms")}

        <button type="submit" disabled={loading} className={`${primaryButtonClass} mt-6`}>
          {loading ? "Creando cuenta..." : "Crear cuenta"}
        </button>

        <p className="text-center text-sm text-gray-500 mt-5">
          ¿Ya tenés una cuenta?
          <button type="button" onClick={onLogin} className="text-orange-500 font-bold ml-1 hover:underline">
            Iniciá sesión
          </button>
        </p>
      </form>
    </AccessScreen>
  );
}
