import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import {
  obtenerMetodosPago,
  crearMetodoPago,
  marcarMetodoPagoPrincipal,
  eliminarMetodoPagoAPI,
} from "./api";
import ErrorCampo from "./ErrorCampo";
import { conError, propsError } from "./erroresCampo";
import { tokenizarTarjeta } from "./pasarelaPagos";
import {
  MARCAS_TARJETA,
  detectarMarca,
  formatearNumeroTarjeta,
  soloDigitos,
  validarTarjeta,
} from "./validaciones";

const FORMULARIO_VACIO = {
  tipo: "Visa",
  titular: "",
  numero: "",
  vencimiento: "",
  cvv: "",
  principal: false,
};

// Campos del backend → campos del formulario, para mostrar sus errores 422.
const CAMPOS_API = { holder: "titular", expiry: "vencimiento", card_type: "tipo" };

const claseInput =
  "w-full mt-2 h-11 px-4 bg-white border border-gray-200 rounded-md text-[10px] outline-hidden focus:border-orange-500";

const LARGO_MAXIMO_NUMERO = Math.max(
  ...Object.values(MARCAS_TARJETA).flatMap((marca) => marca.largos)
);

/** "1228" → "12/28" mientras se escribe. */
function formatearVencimiento(valor) {
  const digitos = soloDigitos(valor).slice(0, 4);
  return digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}` : digitos;
}

export default function MetodosPago({
  onHome,
  onCatalogo,
  onLogin,
  onMarcas,
  onCarrito,
  onFavoritos,
  cantidadCarrito = 0,
  cantidadFavoritos = 0,
  onPerfil,
}) {
  const [metodos, setMetodos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);
  const [errores, setErrores] = useState({});
  const [errorFormulario, setErrorFormulario] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    obtenerMetodosPago()
      .then(setMetodos)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  const actualizar = (cambios) => {
    setFormulario((actual) => ({ ...actual, ...cambios }));
    setErrores((actuales) => {
      const siguientes = { ...actuales };
      for (const campo of Object.keys(cambios)) delete siguientes[campo];
      // Cambiar la marca puede arreglar el número o el CVV.
      if ("tipo" in cambios) {
        delete siguientes.numero;
        delete siguientes.cvv;
      }
      return siguientes;
    });
    setErrorFormulario("");
  };

  const manejarCambio = (e) => {
    const { name, value, type, checked } = e.target;
    actualizar({ [name]: type === "checkbox" ? checked : value });
  };

  // Si el número es de una marca conocida, se elige sola.
  const cambiarNumero = (e) => {
    const numero = soloDigitos(e.target.value).slice(0, LARGO_MAXIMO_NUMERO);
    const detectada = detectarMarca(numero);
    actualizar(detectada ? { numero, tipo: detectada } : { numero });
  };

  const alternarFormulario = () => {
    setMostrarFormulario(!mostrarFormulario);
    setFormulario(FORMULARIO_VACIO);
    setErrores({});
    setErrorFormulario("");
  };

  const agregarMetodo = async (e) => {
    e.preventDefault();

    const erroresFormulario = validarTarjeta(formulario);
    setErrores(erroresFormulario);
    if (Object.keys(erroresFormulario).length > 0) return;

    setGuardando(true);
    try {
      // El número completo y el CVV se quedan en la pasarela: a la API
      // solo llegan la marca, los últimos 4 dígitos y el vencimiento.
      const tarjeta = await tokenizarTarjeta(formulario);
      await crearMetodoPago({
        tarjeta,
        titular: formulario.titular,
        principal: formulario.principal,
      });
      setMetodos(await obtenerMetodosPago());
      setError("");
      setFormulario(FORMULARIO_VACIO);
      setMostrarFormulario(false);
    } catch (err) {
      const campos = Object.fromEntries(
        Object.entries(err.campos || {})
          .filter(([campo]) => CAMPOS_API[campo])
          .map(([campo, mensaje]) => [CAMPOS_API[campo], mensaje])
      );
      if (Object.keys(campos).length > 0) setErrores(campos);
      else setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminarMetodo = async (id) => {
    try {
      await eliminarMetodoPagoAPI(id);
      setMetodos(await obtenerMetodosPago());
    } catch (err) {
      alert(err.message);
    }
  };

  const marcarPrincipal = async (id) => {
    try {
      await marcarMetodoPagoPrincipal(id);
      setMetodos(await obtenerMetodosPago());
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-linear-to-b from-black to-[#492202]">

      <Navbar
        paginaActual="perfil"
        onHome={onHome}
        onCatalogo={onCatalogo}
        onLogin={onLogin}
        onMarcas={onMarcas}
        onCarrito={onCarrito}
        onFavoritos={onFavoritos}
        cantidadCarrito={cantidadCarrito}
        cantidadFavoritos={cantidadFavoritos}
      />

      <main className="min-h-screen flex items-center justify-center px-5 pt-24 pb-10">

        <div className="w-full max-w-[950px] bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* ENCABEZADO */}

          <div className="bg-gray-50 border-b border-gray-200 px-8 md:px-12 py-8">

            <button
              type="button"
              onClick={onPerfil}
              className="text-orange-500 text-[9px] font-bold hover:underline mb-4"
            >
              ← VOLVER A MI PERFIL
            </button>

            <p className="text-orange-500 text-[9px] font-black tracking-[4px]">
              AUTOBOUGHT
            </p>

            <h1 className="text-3xl font-black italic uppercase mt-2 text-gray-900">
              MÉTODOS DE PAGO
            </h1>

            <p className="text-gray-400 text-[10px] mt-2">
              Administrá tus tarjetas y métodos de pago.
            </p>

          </div>

          <div className="p-8 md:p-12">

            {/* AGREGAR */}

            <div className="flex justify-end mb-8">

              <button
                type="button"
                onClick={alternarFormulario}
                className="h-10 px-6 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-[9px] font-black transition"
              >
                {mostrarFormulario
                  ? "CANCELAR"
                  : "+ AGREGAR TARJETA"}
              </button>

            </div>

            {/* FORMULARIO */}

            {mostrarFormulario && (
              <form
                onSubmit={agregarMetodo}
                noValidate
                className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-8"
              >

                <h2 className="text-sm font-black uppercase text-gray-900 mb-5">
                  NUEVO MÉTODO DE PAGO
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                  <div>
                    <label htmlFor="tarjeta-numero" className="text-[9px] font-bold text-gray-500">
                      NÚMERO DE TARJETA *
                    </label>

                    <input
                      id="tarjeta-numero"
                      name="numero"
                      value={formatearNumeroTarjeta(formulario.numero, formulario.tipo)}
                      onChange={cambiarNumero}
                      inputMode="numeric"
                      autoComplete="cc-number"
                      placeholder="1234 5678 9012 3456"
                      className={conError(claseInput, errores.numero)}
                      {...propsError("numero", errores.numero)}
                    />
                    <ErrorCampo campo="numero" mensaje={errores.numero} />
                  </div>

                  <div>
                    <label htmlFor="tarjeta-tipo" className="text-[9px] font-bold text-gray-500">
                      TIPO DE TARJETA
                    </label>

                    {/* Visa, Mastercard y Amex se detectan por el número; OCA se elige. */}
                    <select
                      id="tarjeta-tipo"
                      name="tipo"
                      value={formulario.tipo}
                      onChange={manejarCambio}
                      disabled={detectarMarca(formulario.numero) !== null}
                      className={conError(claseInput, errores.tipo)}
                    >
                      {Object.keys(MARCAS_TARJETA).map((marca) => (
                        <option key={marca} value={marca}>
                          {marca}
                        </option>
                      ))}
                    </select>
                    <ErrorCampo campo="tipo" mensaje={errores.tipo} />
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="tarjeta-titular" className="text-[9px] font-bold text-gray-500">
                      TITULAR *
                    </label>

                    <input
                      id="tarjeta-titular"
                      name="titular"
                      value={formulario.titular}
                      onChange={manejarCambio}
                      maxLength={120}
                      autoComplete="cc-name"
                      placeholder="Como figura en la tarjeta"
                      className={conError(claseInput, errores.titular)}
                      {...propsError("titular", errores.titular)}
                    />
                    <ErrorCampo campo="titular" mensaje={errores.titular} />
                  </div>

                  <div>
                    <label htmlFor="tarjeta-vencimiento" className="text-[9px] font-bold text-gray-500">
                      VENCIMIENTO *
                    </label>

                    <input
                      id="tarjeta-vencimiento"
                      name="vencimiento"
                      value={formulario.vencimiento}
                      onChange={(e) =>
                        actualizar({ vencimiento: formatearVencimiento(e.target.value) })
                      }
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/AA"
                      maxLength={5}
                      className={conError(claseInput, errores.vencimiento)}
                      {...propsError("vencimiento", errores.vencimiento)}
                    />
                    <ErrorCampo campo="vencimiento" mensaje={errores.vencimiento} />
                  </div>

                  <div>
                    <label htmlFor="tarjeta-cvv" className="text-[9px] font-bold text-gray-500">
                      CÓDIGO DE SEGURIDAD *
                    </label>

                    <input
                      id="tarjeta-cvv"
                      name="cvv"
                      type="password"
                      value={formulario.cvv}
                      onChange={(e) =>
                        actualizar({ cvv: soloDigitos(e.target.value).slice(0, 4) })
                      }
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder={formulario.tipo === "American Express" ? "4 dígitos" : "3 dígitos"}
                      className={conError(claseInput, errores.cvv)}
                      {...propsError("cvv", errores.cvv)}
                    />
                    <ErrorCampo campo="cvv" mensaje={errores.cvv} />
                  </div>

                </div>

                <label className="flex items-center gap-2 mt-5 text-[9px] font-bold text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    name="principal"
                    checked={formulario.principal}
                    onChange={manejarCambio}
                    className="accent-orange-500"
                  />
                  MARCAR COMO MÉTODO PRINCIPAL
                </label>

                <p className="text-[8px] text-gray-400 mt-5">
                  Por seguridad, solo guardamos la marca, los últimos 4 dígitos y el
                  vencimiento. El número completo y el código de seguridad no se guardan.
                </p>

                {errorFormulario && (
                  <p role="alert" className="text-red-500 text-[10px] mt-4">
                    {errorFormulario}
                  </p>
                )}

                <div className="flex justify-end mt-5">

                  <button
                    type="submit"
                    disabled={guardando}
                    className="h-10 px-6 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-md text-[9px] font-black"
                  >
                    {guardando ? "GUARDANDO..." : "GUARDAR TARJETA"}
                  </button>

                </div>

              </form>
            )}

            {/* TARJETAS */}

            {cargando ? (

              <p className="text-center text-gray-400 text-sm py-16">
                Cargando…
              </p>

            ) : error ? (

              <p className="text-center text-red-500 text-sm py-16">
                {error}
              </p>

            ) : metodos.length === 0 ? (

              <div className="text-center py-16">

                <p className="text-gray-400 text-sm">
                  No tenés métodos de pago guardados.
                </p>

                <p className="text-gray-300 text-[9px] mt-2">
                  Agregá una tarjeta para utilizarla durante tus compras.
                </p>

              </div>

            ) : (

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {metodos.map((metodo) => (

                  <div
                    key={metodo.id}
                    className="border border-gray-200 rounded-xl p-6 relative"
                  >

                    {metodo.vencida ? (
                      <span className="absolute top-4 right-4 text-[7px] font-black bg-red-100 text-red-600 px-2 py-1 rounded-sm">
                        VENCIDA
                      </span>
                    ) : metodo.principal && (
                      <span className="absolute top-4 right-4 text-[7px] font-black bg-orange-100 text-orange-500 px-2 py-1 rounded-sm">
                        PRINCIPAL
                      </span>
                    )}

                    <p className="text-orange-500 text-[9px] font-black tracking-[2px]">
                      {metodo.tipo}
                    </p>

                    <p className="text-xl font-black text-gray-900 mt-4 tracking-[3px]">
                      •••• •••• •••• {metodo.numero}
                    </p>

                    <p className="text-[9px] text-gray-500 mt-4">
                      {metodo.titular}
                    </p>

                    <p className={`text-[9px] mt-1 ${metodo.vencida ? "text-red-500 font-bold" : "text-gray-400"}`}>
                      {metodo.vencida ? "Venció" : "Vence"}: {metodo.vencimiento}
                    </p>

                    <div className="flex gap-3 mt-6">

                      {!metodo.principal && !metodo.vencida && (
                        <button
                          type="button"
                          onClick={() =>
                            marcarPrincipal(metodo.id)
                          }
                          className="text-[8px] text-orange-500 font-bold hover:underline"
                        >
                          MARCAR PRINCIPAL
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          eliminarMetodo(metodo.id)
                        }
                        className="text-[8px] text-red-500 font-bold hover:underline"
                      >
                        ELIMINAR
                      </button>

                    </div>

                  </div>

                ))}

              </div>

            )}

          </div>

        </div>

      </main>

    </div>
  );
}