// Pantalla de registro de un cliente.

import { useState } from "react";
import { registrar as registrarEnApi } from "./api";
import { decodeToken } from "./auth";
import ErrorCampo from "./ErrorCampo";
import { conError, propsError } from "./erroresCampo";
import { claseBotonPrincipal, claseCampo } from "./estilosAcceso";
import { fuerzaPassword } from "./fuerzaPassword";
import PantallaAcceso, { AvisoError, Campo, CampoPassword, EncabezadoAcceso } from "./PantallaAcceso";
import { formatearTelefonoUY, normalizarTelefonoUY } from "./telefono";
import { NOMBRE_MAX, limpiar, validarRegistro } from "./validaciones";

// Campos del backend → campos del formulario, para mostrar sus errores 422.
const CAMPOS_API = { name: "nombre", email: "email", phone: "telefono", password: "password" };

// Los errores de las pantallas de acceso, con letra legible.
const claseError = "text-xs mt-1.5";

// Barrita de "qué tan segura es" debajo de la contraseña.
function IndicadorFuerza({ password }) {
  const fuerza = fuerzaPassword(password);
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

export default function Registro({
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
    const encontrado = validarRegistro(valores)[campo];
    setErrores((actuales) => ({ ...actuales, [campo]: encontrado }));
  };

  // Al editar un campo se borra su error.
  const cambiar = (campo, setter) => (e) => {
    setter(campo === "terminos" ? e.target.checked : e.target.value);
    setErrores((actuales) => ({ ...actuales, [campo]: undefined }));
  };

  const registrar = async (e) => {
    e.preventDefault();
    setError("");

    const erroresFormulario = validarRegistro({
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
        nombre: limpiar(nombre),
        apellido: limpiar(apellido),
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
        nombre: `${limpiar(nombre)} ${limpiar(apellido)}`,
        apellido: "",
        email: email.trim().toLowerCase(),
        telefono: formatearTelefonoUY(normalizarTelefonoUY(telefono)),
        // Recién registrado: el mail de verificación acaba de salir.
        emailVerificado: false,
      });
    } catch (err) {
      const campos = Object.fromEntries(
        Object.entries(err.campos || {})
          .filter(([campo]) => CAMPOS_API[campo])
          .map(([campo, mensaje]) => [CAMPOS_API[campo], mensaje])
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
    className: conError(claseCampo, errores[campo]),
    ...propsError(campo, errores[campo]),
  });

  const errorDe = (campo) => <ErrorCampo campo={campo} mensaje={errores[campo]} className={claseError} />;

  return (
    <PantallaAcceso
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
      <form onSubmit={registrar} noValidate>
        <EncabezadoAcceso titulo="CREAR CUENTA" bajada="Registrate para comprar, seguir tus pedidos y guardar tus repuestos." />

        <AvisoError>{error}</AvisoError>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 mt-6">
          <Campo id="registro-nombre" etiqueta="Nombre" error={errorDe("nombre")}>
            <input type="text" placeholder="Tu nombre" maxLength={NOMBRE_MAX} autoComplete="given-name" {...propsCampo("nombre", nombre, setNombre)} />
          </Campo>

          <Campo id="registro-apellido" etiqueta="Apellido" error={errorDe("apellido")}>
            <input type="text" placeholder="Tu apellido" maxLength={NOMBRE_MAX} autoComplete="family-name" {...propsCampo("apellido", apellido, setApellido)} />
          </Campo>

          <Campo id="registro-email" etiqueta="Correo electrónico" error={errorDe("email")}>
            <input type="email" placeholder="tu@email.com" maxLength={254} autoComplete="email" {...propsCampo("email", email, setEmail)} />
          </Campo>

          <Campo id="registro-telefono" etiqueta="Teléfono" error={errorDe("telefono")}>
            <input type="tel" placeholder="099 123 456" maxLength={30} autoComplete="tel" {...propsCampo("telefono", telefono, setTelefono)} />
          </Campo>

          <Campo
            id="registro-password"
            etiqueta="Contraseña"
            error={errores.password ? errorDe("password") : null}
            ayuda={<IndicadorFuerza password={password} />}
          >
            <CampoPassword placeholder="Mínimo 8 caracteres" autoComplete="new-password" {...propsCampo("password", password, setPassword)} />
          </Campo>

          <Campo id="registro-confirmarPassword" etiqueta="Confirmar contraseña" error={errorDe("confirmarPassword")}>
            <CampoPassword
              placeholder="Repetí tu contraseña"
              autoComplete="new-password"
              {...propsCampo("confirmarPassword", confirmarPassword, setConfirmarPassword)}
            />
          </Campo>
        </div>

        <label className="flex items-start gap-2.5 mt-5 cursor-pointer select-none w-fit">
          <input
            type="checkbox"
            checked={aceptaTerminos}
            onChange={cambiar("terminos", setAceptaTerminos)}
            className="w-4 h-4 mt-0.5 accent-orange-500"
            {...propsError("terminos", errores.terminos)}
          />
          <span className="text-sm text-gray-600">Acepto los términos y condiciones.</span>
        </label>
        {errorDe("terminos")}

        <button type="submit" disabled={cargando} className={`${claseBotonPrincipal} mt-6`}>
          {cargando ? "Creando cuenta..." : "Crear cuenta"}
        </button>

        <p className="text-center text-sm text-gray-500 mt-5">
          ¿Ya tenés una cuenta?
          <button type="button" onClick={onLogin} className="text-orange-500 font-bold ml-1 hover:underline">
            Iniciá sesión
          </button>
        </p>
      </form>
    </PantallaAcceso>
  );
}
