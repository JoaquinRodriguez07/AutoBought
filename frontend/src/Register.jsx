// Pantalla de registro de un cliente.

import { useState } from "react";
import { register as registrarEnApi } from "./api";
import { decodeToken } from "./auth";
import FieldError from "./FieldError";
import { withError, errorProps } from "./fieldErrors";
import { primaryButtonClass, fieldClass } from "./accessStyles";
import { passwordStrength } from "./passwordStrength";
import AccessScreen, { ErrorNotice, FormField, PasswordField, AccessHeader } from "./AccessScreen";
import { formatUyPhone, normalizeUyPhone } from "./phone";
import { NAME_MAX, clean, validateRegistration } from "./validations";

// Campos del backend → campos del formulario, para mostrar sus errores 422.
const API_FIELDS = { name: "nombre", email: "email", phone: "telefono", password: "password" };

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
  onMarcas,
  onCarrito,
  onFavoritos,
  cantidadCarrito,
  cantidadFavoritos,
  onRegistroExitoso,
}) {
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [password, setPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [aceptaTerminos, setAceptaTerminos] = useState(false);

  const [error, setError] = useState("");
  const [errores, setErrores] = useState({});
  const [cargando, setCargando] = useState(false);

  const valores = { nombre, apellido, email, telefono, password, confirmarPassword, aceptaTerminos };

  // Al salir de un campo con algo escrito se muestra su error, sin esperar
  // a "Crear cuenta".
  const revisar = (campo) => () => {
    const valor = valores[campo];
    if (typeof valor === "string" && !valor.trim()) return;
    const encontrado = validateRegistration(valores)[campo];
    setErrores((actuales) => ({ ...actuales, [campo]: encontrado }));
  };

  // Al editar un campo se borra su error.
  const cambiar = (campo, setter) => (e) => {
    setter(campo === "terminos" ? e.target.checked : e.target.value);
    setErrores((actuales) => ({ ...actuales, [campo]: undefined }));
  };

  const register = async (e) => {
    e.preventDefault();
    setError("");

    const erroresFormulario = validateRegistration({
      nombre,
      apellido,
      email,
      telefono,
      password,
      confirmarPassword,
      aceptaTerminos,
    });
    setErrores(erroresFormulario);
    if (Object.keys(erroresFormulario).length > 0) return;

    setCargando(true);

    try {
      const data = await registrarEnApi({
        nombre: clean(nombre),
        apellido: clean(apellido),
        email: email.trim(),
        telefono: telefono.trim(),
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
        nombre: `${clean(nombre)} ${clean(apellido)}`,
        apellido: "",
        email: email.trim().toLowerCase(),
        telefono: formatUyPhone(normalizeUyPhone(telefono)),
        // Recién registrado: el mail de verificación acaba de salir.
        emailVerificado: false,
      });
    } catch (err) {
      const campos = Object.fromEntries(
        Object.entries(err.campos || {})
          .filter(([campo]) => API_FIELDS[campo])
          .map(([campo, mensaje]) => [API_FIELDS[campo], mensaje])
      );
      if (Object.keys(campos).length > 0) setErrores(campos);
      else setError(err.message || "No pudimos crear tu cuenta.");
    } finally {
      setCargando(false);
    }
  };

  const propsNavbar = {
    onHome,
    onCatalogo,
    onLogin,
    onMarcas,
    onCarrito,
    onFavoritos,
    cantidadCarrito,
    cantidadFavoritos,
  };

  // Lo común a cada campo: valor, cambio, salida, borde y accesibilidad.
  const propsCampo = (campo, valor, setter) => ({
    id: `registro-${campo}`,
    value: valor,
    onChange: cambiar(campo, setter),
    onBlur: revisar(campo),
    className: withError(fieldClass, errores[campo]),
    ...errorProps(campo, errores[campo]),
  });

  const errorDe = (campo) => <FieldError campo={campo} mensaje={errores[campo]} className={errorClass} />;

  return (
    <AccessScreen
      propsNavbar={propsNavbar}
      etiqueta="CREÁ TU CUENTA GRATIS"
      titulo={["Tu auto,", "siempre en", "movimiento."]}
      beneficios={[
        "Repuestos que le sirven a tu auto",
        "Seguimiento de cada pedido",
        "Avisos cuando vuelve el stock",
        "Recordatorios de mantenimiento",
      ]}
      ancho="max-w-[960px]"
    >
      <form onSubmit={register} noValidate>
        <AccessHeader titulo="CREAR CUENTA" bajada="Registrate para comprar, seguir tus pedidos y guardar tus repuestos." />

        <ErrorNotice>{error}</ErrorNotice>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 mt-6">
          <FormField id="registro-nombre" etiqueta="Nombre" error={errorDe("nombre")}>
            <input type="text" placeholder="Tu nombre" maxLength={NAME_MAX} autoComplete="given-name" {...propsCampo("nombre", nombre, setNombre)} />
          </FormField>

          <FormField id="registro-apellido" etiqueta="Apellido" error={errorDe("apellido")}>
            <input type="text" placeholder="Tu apellido" maxLength={NAME_MAX} autoComplete="family-name" {...propsCampo("apellido", apellido, setApellido)} />
          </FormField>

          <FormField id="registro-email" etiqueta="Correo electrónico" error={errorDe("email")}>
            <input type="email" placeholder="tu@email.com" maxLength={254} autoComplete="email" {...propsCampo("email", email, setEmail)} />
          </FormField>

          <FormField id="registro-telefono" etiqueta="Teléfono" error={errorDe("telefono")}>
            <input type="tel" placeholder="099 123 456" maxLength={30} autoComplete="tel" {...propsCampo("telefono", telefono, setTelefono)} />
          </FormField>

          <FormField
            id="registro-password"
            etiqueta="Contraseña"
            error={errores.password ? errorDe("password") : null}
            ayuda={<StrengthMeter password={password} />}
          >
            <PasswordField placeholder="Mínimo 8 caracteres" autoComplete="new-password" {...propsCampo("password", password, setPassword)} />
          </FormField>

          <FormField id="registro-confirmarPassword" etiqueta="Confirmar contraseña" error={errorDe("confirmarPassword")}>
            <PasswordField
              placeholder="Repetí tu contraseña"
              autoComplete="new-password"
              {...propsCampo("confirmarPassword", confirmarPassword, setConfirmarPassword)}
            />
          </FormField>
        </div>

        <label className="flex items-start gap-2.5 mt-5 cursor-pointer select-none w-fit">
          <input
            type="checkbox"
            checked={aceptaTerminos}
            onChange={cambiar("terminos", setAceptaTerminos)}
            className="w-4 h-4 mt-0.5 accent-orange-500"
            {...errorProps("terminos", errores.terminos)}
          />
          <span className="text-sm text-gray-600">Acepto los términos y condiciones.</span>
        </label>
        {errorDe("terminos")}

        <button type="submit" disabled={cargando} className={`${primaryButtonClass} mt-6`}>
          {cargando ? "Creando cuenta..." : "Crear cuenta"}
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
