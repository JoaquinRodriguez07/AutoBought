import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import {
  obtenerMetodosPago,
  crearMetodoPago,
  marcarMetodoPagoPrincipal,
  eliminarMetodoPagoAPI,
} from "./api";

const FORMULARIO_VACIO = {
  tipo: "Visa",
  titular: "",
  numero: "",
  vencimiento: "",
  principal: false,
};

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

  useEffect(() => {
    obtenerMetodosPago()
      .then(setMetodos)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  const manejarCambio = (e) => {
    const { name, value, type, checked } = e.target;

    setFormulario((actual) => ({
      ...actual,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const formatearTarjeta = (numero) => {
    const limpio = numero.replace(/\D/g, "");

    return limpio.replace(/(.{4})/g, "$1 ").trim();
  };

  const agregarMetodo = async (e) => {
    e.preventDefault();

    if (
      !formulario.titular ||
      !formulario.numero ||
      !formulario.vencimiento
    ) {
      alert("Completá todos los campos.");
      return;
    }

    if (formulario.numero.replace(/\D/g, "").length < 13) {
      alert("Ingresá un número de tarjeta válido.");
      return;
    }

    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(formulario.vencimiento)) {
      alert("El vencimiento debe tener el formato MM/AA.");
      return;
    }

    try {
      await crearMetodoPago(formulario);
      setMetodos(await obtenerMetodosPago());
      setError("");
      setFormulario(FORMULARIO_VACIO);
      setMostrarFormulario(false);
    } catch (err) {
      alert(err.message);
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
    <div className="min-h-screen flex flex-col font-sans bg-gradient-to-b from-black to-[#492202]">

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
                onClick={() =>
                  setMostrarFormulario(!mostrarFormulario)
                }
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
                className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-8"
              >

                <h2 className="text-sm font-black uppercase text-gray-900 mb-5">
                  NUEVO MÉTODO DE PAGO
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                  <div>
                    <label className="text-[9px] font-bold text-gray-500">
                      TIPO DE TARJETA
                    </label>

                    <select
                      name="tipo"
                      value={formulario.tipo}
                      onChange={manejarCambio}
                      className="w-full mt-2 h-11 px-4 bg-white border border-gray-200 rounded-md text-[10px] outline-none focus:border-orange-500"
                    >
                      <option value="Visa">
                        Visa
                      </option>

                      <option value="Mastercard">
                        Mastercard
                      </option>

                      <option value="American Express">
                        American Express
                      </option>

                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-gray-500">
                      TITULAR *
                    </label>

                    <input
                      name="titular"
                      value={formulario.titular}
                      onChange={manejarCambio}
                      placeholder="Nombre del titular"
                      className="w-full mt-2 h-11 px-4 bg-white border border-gray-200 rounded-md text-[10px] outline-none focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-gray-500">
                      NÚMERO DE TARJETA *
                    </label>

                    <input
                      name="numero"
                      value={formatearTarjeta(formulario.numero)}
                      onChange={(e) =>
                        setFormulario((actual) => ({
                          ...actual,
                          numero: e.target.value.replace(/\D/g, ""),
                        }))
                      }
                      maxLength={19}
                      placeholder="1234 5678 9012 3456"
                      className="w-full mt-2 h-11 px-4 bg-white border border-gray-200 rounded-md text-[10px] outline-none focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-gray-500">
                      VENCIMIENTO *
                    </label>

                    <input
                      name="vencimiento"
                      value={formulario.vencimiento}
                      onChange={manejarCambio}
                      placeholder="MM/AA"
                      maxLength={5}
                      className="w-full mt-2 h-11 px-4 bg-white border border-gray-200 rounded-md text-[10px] outline-none focus:border-orange-500"
                    />
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
                Por seguridad, solo guardamos los últimos 4 dígitos de la tarjeta.
                </p>

                <div className="flex justify-end mt-5">

                  <button
                    type="submit"
                    className="h-10 px-6 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-[9px] font-black"
                  >
                    GUARDAR TARJETA
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

                    {metodo.principal && (
                      <span className="absolute top-4 right-4 text-[7px] font-black bg-orange-100 text-orange-500 px-2 py-1 rounded">
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

                    <p className="text-[9px] text-gray-400 mt-1">
                      Vence: {metodo.vencimiento}
                    </p>

                    <div className="flex gap-3 mt-6">

                      {!metodo.principal && (
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