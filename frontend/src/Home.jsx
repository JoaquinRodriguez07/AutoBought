import { useEffect, useState } from "react";

import Navbar from "./Navbar";
import BrandDropdown from "./BrandDropdown";
import ModelDropdown from "./ModelDropdown";
import { obtenerAnios, obtenerCategorias, obtenerMasVendidos } from "./api";
import { useVehicle } from "./context/VehicleContext";
import repuestos from "./assets/repuestos.jpg";
import {
  IconoAuto,
  IconoCaja,
  IconoCamion,
  IconoChispa,
  IconoDisco,
  IconoEngranaje,
  IconoEscobilla,
  IconoEscudo,
  IconoFiltro,
  IconoGota,
  IconoRayo,
  IconoResorte,
  IconoTermometro,
} from "./Iconos";

import AudiLogo from "./assets/Logos Vehiculos/Audi.svg";
import BMWLogo from "./assets/Logos Vehiculos/BMW.png";
import BydLogo from "./assets/Logos Vehiculos/Byd.png";
import CheryLogo from "./assets/Logos Vehiculos/Chery.webp";
import ChevroletLogo from "./assets/Logos Vehiculos/Chevrolet.png";
import CitroenLogo from "./assets/Logos Vehiculos/Citroen.png";
import FiatLogo from "./assets/Logos Vehiculos/Fiat.png";
import GacLogo from "./assets/Logos Vehiculos/Gac.png";
import HyundaiLogo from "./assets/Logos Vehiculos/Hyundai.webp";
import MercedesLogo from "./assets/Logos Vehiculos/Mercedes.png";
import PeugeotLogo from "./assets/Logos Vehiculos/Peugeot.webp";
import RenaultLogo from "./assets/Logos Vehiculos/Renault.png";
import SuzukiLogo from "./assets/Logos Vehiculos/Suzuki.png";
import VolkswagenLogo from "./assets/Logos Vehiculos/Volkswagen.webp";

// Los fabricantes principales del catálogo (ver MANUFACTURERS en
// backend/scripts/generate_dataset.py).
const FABRICANTES = ["Bosch", "Brembo", "NGK", "Mann-Filter", "Monroe", "Valeo", "Castrol", "Moura"];

// Ícono de cada categoría. Las categorías vienen del servidor: una que no
// esté acá (nueva) se muestra con el ícono genérico, sin romper nada.
const ICONOS_CATEGORIA = {
  Accesorios: IconoEscobilla,
  Carrocería: IconoAuto,
  Eléctrico: IconoRayo,
  Encendido: IconoChispa,
  Filtros: IconoFiltro,
  Frenos: IconoDisco,
  Lubricantes: IconoGota,
  Motor: IconoEngranaje,
  Refrigeración: IconoTermometro,
  Suspensión: IconoResorte,
};

// Las que más se buscan van destacadas, más grandes, arriba.
const CATEGORIAS_DESTACADAS = ["Frenos", "Filtros", "Motor"];

export default function Home({
  usuario,
  onHome,
  onLogin,
  onCatalogo,
  onDetalle,
  onMarcas,
  onCarrito,
  onFavoritos,

  onPerfil,
  onDirecciones,
  onMetodosPago,
  onHistorial,
  onCerrarSesion,

  cantidadCarrito,
  cantidadFavoritos,
}) {
  // ==========================================
  // VEHICLE SELECTION
  // ==========================================
  // Lo que se elige en los dropdowns es un BORRADOR local. Recién al
  // hacer clic en "Buscar Repuestos" pasa a ser el Vehículo Activo
  // (VehicleContext) y el catálogo consulta la API.

  const { vehiculoActivo, activarVehiculo, limpiarVehiculo } =
    useVehicle();

  const [selectedBrand, setSelectedBrand] = useState(
    vehiculoActivo?.brand || ""
  );

  const [selectedModel, setSelectedModel] = useState(
    vehiculoActivo?.model || ""
  );

  const [selectedYear, setSelectedYear] = useState(
    vehiculoActivo?.year || ""
  );

  const [years, setYears] = useState([]);
  const [loadingYears, setLoadingYears] = useState(false);


  // ==========================================
  // SINCRONIZAR CON EL VEHÍCULO ACTIVO
  // ==========================================
  // Si el vehículo activo cambia desde afuera (por ejemplo, "Borrar
  // filtros" en el catálogo), los dropdowns lo reflejan.

  useEffect(() => {
    setSelectedBrand(vehiculoActivo?.brand || "");
    setSelectedModel(vehiculoActivo?.model || "");
    setSelectedYear(vehiculoActivo?.year || "");
  }, [vehiculoActivo]);

  // ==========================================
  // CAMBIO DE MARCA
  // ==========================================

  const handleBrandChange = (brand) => {
    setSelectedBrand(brand);
    setSelectedModel("");
    setSelectedYear("");
    setYears([]);
  };

  // ==========================================
  // CAMBIO DE MODELO
  // ==========================================

  const handleModelChange = (model) => {
    setSelectedModel(model);
    setSelectedYear("");
  };

  // ==========================================
  // VALIDACIÓN + BUSCAR / BORRAR
  // ==========================================
  // Cascada mínima obligatoria: Marca > Modelo > Año. Mientras falte
  // alguno, "Buscar Repuestos" queda deshabilitado.

  const puedeBuscar = Boolean(
    selectedBrand && selectedModel && selectedYear
  );

  const hayAlgoParaBorrar = Boolean(
    selectedBrand || selectedModel || selectedYear || vehiculoActivo
  );

  const buscarRepuestos = () => {
    if (!puedeBuscar) return;

    const vehiculo = {
      brand: selectedBrand,
      model: selectedModel,
      year: selectedYear,
    };

    activarVehiculo(vehiculo);
    onCatalogo(null, vehiculo);
  };

  // Vuelve todo al estado inicial (solo Marca habilitado) y quita el
  // vehículo activo: el catálogo vuelve a la lista completa.
  const borrarFiltros = () => {
    setSelectedBrand("");
    setSelectedModel("");
    setSelectedYear("");
    setYears([]);
    limpiarVehiculo();
  };

  // ==========================================
  // CARGAR AÑOS SEGÚN MARCA + MODELO
  // ==========================================

  useEffect(() => {
    if (!selectedBrand || !selectedModel) {
      setYears([]);
      return;
    }

    // Si cambia la marca o el modelo antes de que llegue la respuesta,
    // se descarta para no mostrar años del modelo anterior.
    let activo = true;

    const cargarAnios = async () => {
      try {
        setLoadingYears(true);

        const anios = await obtenerAnios(selectedBrand, selectedModel);

        if (activo) setYears(anios);
      } catch (error) {
        console.error("Error cargando años:", error);
        if (activo) setYears([]);
      } finally {
        if (activo) setLoadingYears(false);
      }
    };

    cargarAnios();

    return () => {
      activo = false;
    };
  }, [selectedBrand, selectedModel]);

  // ==========================================
  // CATEGORÍAS
  // ==========================================

  // Las categorías vienen del backend (mismo helper que usa el
  // catálogo: obtenerCategorias -> GET /api/v1/parts/categories), así
  // los nombres que Home le pasa a onCatalogo son exactamente los que
  // el servidor sabe filtrar. `null` = todavía cargando.
  //
  // Home es una landing: si el pedido falla, la grilla queda vacía y
  // el resto de la página sigue funcionando; no se muestra un cartel
  // de error.

  const [categorias, setCategorias] = useState(null);

  useEffect(() => {
    let activo = true;

    obtenerCategorias()
      .then((lista) => {
        if (!activo) return;
        setCategorias(lista);
      })
      .catch(() => {
        if (!activo) return;
        setCategorias([]);
      });

    return () => {
      activo = false;
    };
  }, []);

  // ==========================================
  // MARCAS
  // ==========================================

  const marcas = [
    {
      nombre: "Volkswagen",
      logo: VolkswagenLogo,
    },
    {
      nombre: "Chevrolet",
      logo: ChevroletLogo,
    },
    {
      nombre: "Fiat",
      logo: FiatLogo,
    },
    {
      nombre: "Renault",
      logo: RenaultLogo,
    },
    {
      nombre: "Ford",
      logo: "https://cdn.simpleicons.org/ford/000000",
    },
    {
      nombre: "Toyota",
      logo: "https://cdn.simpleicons.org/toyota/000000",
    },
    {
      nombre: "Peugeot",
      logo: PeugeotLogo,
    },
    {
      nombre: "Nissan",
      logo: "https://cdn.simpleicons.org/nissan/000000",
    },
  ];

  // ==========================================
  // PRODUCTOS MÁS VENDIDOS
  // ==========================================
  // Los más vendidos de los últimos 90 días que hoy tienen stock
  // (GET /api/v1/parts/best-sellers). `null` = todavía cargando.
  // Igual que las categorías: si no hay ventas o el pedido falla, la
  // sección se oculta y el resto de la página sigue funcionando.

  const [masVendidos, setMasVendidos] = useState(null);

  useEffect(() => {
    let activo = true;

    obtenerMasVendidos()
      .then((lista) => {
        if (!activo) return;
        setMasVendidos(lista);
      })
      .catch(() => {
        if (!activo) return;
        setMasVendidos([]);
      });

    return () => {
      activo = false;
    };
  }, []);

  const precio = (valor) => `$${valor.toLocaleString("es-UY")}`;

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">

      {/* =====================================================
          NAVBAR
      ====================================================== */}

      <Navbar
        paginaActual="home"
        usuario={usuario}
        onHome={onHome}
        onCatalogo={onCatalogo}
        onLogin={onLogin}
        onMarcas={onMarcas}
        onCarrito={onCarrito}
        onFavoritos={onFavoritos}
        onPerfil={onPerfil}
        onDirecciones={onDirecciones}
        onMetodosPago={onMetodosPago}
        onHistorial={onHistorial}
        onCerrarSesion={onCerrarSesion}
        cantidadCarrito={cantidadCarrito}
        cantidadFavoritos={cantidadFavoritos}
      />

      {/* =====================================================
          HERO + SELECTOR DE VEHÍCULO
      ====================================================== */}
      {/* La acción principal del inicio es elegir el auto: el selector
          va adentro del hero. Lo elegido es un borrador hasta tocar
          "Buscar repuestos" (ver arriba). */}

      <section className="relative overflow-hidden bg-black">

        {/* Oscurecida y corrida hacia abajo para que no se vean las
            partes blancas de la foto. */}
        <img
          src={repuestos}
          alt="Repuestos para vehículos"
          className="absolute inset-0 w-full h-full object-cover object-bottom"
        />

        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 bg-linear-to-r from-black/85 via-black/60 to-black/50" />

        <div className="relative z-10 max-w-[1100px] mx-auto px-6 md:px-10 pt-36 pb-12">

          <p className="text-orange-500 text-xs font-black tracking-[4px]">
            REPUESTOS PARA TU AUTO
          </p>

          <h1 className="text-white text-4xl md:text-6xl font-black italic uppercase leading-none mt-4 max-w-[680px]">
            REPUESTOS QUE TE MANTIENEN EN MOVIMIENTO
          </h1>

          <p className="text-gray-300 text-base mt-5 max-w-[520px] leading-relaxed">
            Elegí tu auto y te mostramos los repuestos que le sirven,
            de las mejores marcas.
          </p>

          {/* SELECTOR DE VEHÍCULO */}

          <div className="mt-10 bg-[#151719]/95 border border-white/10 rounded-xl shadow-2xl p-5 md:p-6">

            <p className="text-white text-sm font-black">¿Qué auto tenés?</p>

            <div className="mt-4 flex flex-col md:flex-row md:items-end gap-4">

              <label className="flex-1">
                <span className="block text-xs text-gray-400 font-bold mb-2">MARCA</span>
                <BrandDropdown
                  value={selectedBrand}
                  onChange={handleBrandChange}
                  className="w-full bg-white rounded-md px-3 h-11 text-sm outline-hidden"
                />
              </label>

              <label className="flex-1">
                <span className="block text-xs text-gray-400 font-bold mb-2">MODELO</span>
                <ModelDropdown
                  brand={selectedBrand}
                  value={selectedModel}
                  onChange={handleModelChange}
                  className="w-full bg-white rounded-md px-3 h-11 text-sm outline-hidden disabled:bg-gray-300 disabled:text-gray-500"
                />
              </label>

              <label className="flex-1">
                <span className="block text-xs text-gray-400 font-bold mb-2">AÑO</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  disabled={!selectedModel || loadingYears}
                  className="w-full bg-white rounded-md px-3 h-11 text-sm outline-hidden disabled:bg-gray-300 disabled:text-gray-500"
                >
                  <option value="">
                    {!selectedModel
                      ? "Seleccioná un modelo"
                      : loadingYears
                      ? "Cargando años..."
                      : "Seleccioná un año"}
                  </option>

                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={buscarRepuestos}
                disabled={!puedeBuscar}
                className="h-11 bg-orange-500 hover:bg-orange-600 text-white rounded-md px-7 text-xs font-black transition disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                BUSCAR REPUESTOS
              </button>

              {hayAlgoParaBorrar && (
                <button
                  type="button"
                  onClick={borrarFiltros}
                  className="h-11 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white rounded-md px-5 text-xs font-black transition"
                >
                  BORRAR FILTROS
                </button>
              )}

            </div>

          </div>

        </div>

      </section>

      {/* =====================================================
          BENEFICIOS
      ====================================================== */}

      <section className="bg-[#151719] border-t border-white/10">

        <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-6 grid grid-cols-1 md:grid-cols-3 gap-5">

          {[
            [IconoEscudo, "Repuestos de calidad", "De fabricantes reconocidos."],
            [IconoAuto, "Compatibilidad", "Solo lo que le sirve a tu auto."],
            [IconoCamion, "Envíos a todo el país", "Recibí tus repuestos donde estés."],
          ].map(([Icono, titulo, texto]) => (

            <div key={titulo} className="flex items-center gap-3">

              <span className="shrink-0 w-10 h-10 rounded-full bg-orange-500/15 text-orange-500 flex items-center justify-center">
                <Icono className="w-5 h-5" />
              </span>

              <div>
                <h3 className="text-white text-sm font-black">{titulo}</h3>
                <p className="text-gray-400 text-sm">{texto}</p>
              </div>

            </div>

          ))}

        </div>

      </section>

      {/* =====================================================
          CATEGORÍAS
      ====================================================== */}

      <Seccion
        etiqueta="TODO PARA TU AUTO"
        titulo="Categorías"
        accion="Ver todas"
        onAccion={() => onCatalogo()}
      >

        {categorias === null && (
          <p className="text-sm text-gray-400">
            Cargando categorías…
          </p>
        )}

        {/* Mosaico: las destacadas grandes arriba y el resto debajo. */}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(categorias || [])
            .filter((c) => CATEGORIAS_DESTACADAS.includes(c.nombre))
            .sort((a, b) => CATEGORIAS_DESTACADAS.indexOf(a.nombre) - CATEGORIAS_DESTACADAS.indexOf(b.nombre))
            .map((categoria) => (
              <TarjetaCategoria
                key={categoria.nombre}
                nombre={categoria.nombre}
                grande
                onClick={() => onCatalogo(categoria.nombre)}
              />
            ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-3">
          {(categorias || [])
            .filter((c) => !CATEGORIAS_DESTACADAS.includes(c.nombre))
            .map((categoria) => (
              <TarjetaCategoria
                key={categoria.nombre}
                nombre={categoria.nombre}
                onClick={() => onCatalogo(categoria.nombre)}
              />
            ))}
        </div>

      </Seccion>

      {/* =====================================================
          MÁS VENDIDOS
      ====================================================== */}
      {/* Si no hay ventas o el pedido falla, la sección no se muestra. */}

      {masVendidos?.length !== 0 && (

        <Seccion
          gris
          etiqueta="LO MÁS ELEGIDO"
          titulo="Más vendidos"
          accion="Ver más"
          onAccion={() => onCatalogo()}
        >

          {masVendidos === null && (
            <p className="text-sm text-gray-400">
              Cargando más vendidos…
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">

            {(masVendidos ?? []).map((producto) => (

              <article
                key={producto.id}
                className="flex flex-col bg-white border border-gray-100 rounded-xl overflow-hidden shadow-xs hover:shadow-lg transition"
              >

                <div className="h-44 bg-white">
                  <img
                    src={producto.imagen}
                    alt={producto.nombre}
                    className="w-full h-full object-contain p-3"
                  />
                </div>

                {/* flex + mt-auto: el botón queda abajo aunque el
                    nombre ocupe una o dos líneas. */}
                <div className="flex flex-col flex-1 p-4">

                  <p className="text-[11px] uppercase tracking-wide text-orange-500 font-black">
                    {producto.fabricante}
                  </p>

                  <h3 className="text-sm font-bold mt-1 leading-snug">
                    {producto.nombre}
                  </h3>

                  <p className="text-xl font-black mt-auto pt-4">
                    {precio(producto.precio)}
                  </p>

                  <button
                    type="button"
                    onClick={() => onDetalle(producto)}
                    className="w-full mt-3 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white rounded-md h-9 text-xs font-bold transition"
                  >
                    VER REPUESTO
                  </button>

                </div>

              </article>

            ))}

          </div>

        </Seccion>

      )}

      {/* =====================================================
          MARCAS Y FABRICANTES
      ====================================================== */}

      <Seccion
        gris={masVendidos?.length === 0}
        etiqueta="TRABAJAMOS CON"
        titulo="Las mejores marcas"
        accion="Ver todas"
        onAccion={onMarcas}
      >

        {/* Dos cintas que se mueven solas: autos para un lado y
            fabricantes para el otro (ver .cinta en index.css). */}

        <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-3">
          Repuestos para tu auto
        </p>

        <Cinta>
          {(copia) =>
            marcas.map((marca) => (
              <button
                key={marca.nombre}
                type="button"
                tabIndex={copia ? -1 : undefined}
                onClick={() => onCatalogo(null, null, { marca: marca.nombre })}
                title={marca.nombre}
                aria-label={`Ver repuestos de ${marca.nombre}`}
                className="group shrink-0 w-36 h-14 flex items-center justify-center"
              >
                {marca.logo ? (
                  <img
                    src={marca.logo}
                    alt={`Logo ${marca.nombre}`}
                    className="max-h-10 max-w-[72px] object-contain grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition duration-300"
                  />
                ) : (
                  <span className="text-sm font-black text-gray-400 group-hover:text-gray-900">
                    {marca.nombre}
                  </span>
                )}
              </button>
            ))
          }
        </Cinta>

        <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mt-8 mb-3">
          Fabricantes de repuestos
        </p>

        <Cinta reversa>
          {(copia) =>
            FABRICANTES.map((fabricante) => (
              <button
                key={fabricante}
                type="button"
                tabIndex={copia ? -1 : undefined}
                onClick={() => onCatalogo(null, null, { fabricante })}
                className="shrink-0 w-40 h-12 text-lg font-black italic tracking-tight text-gray-400 hover:text-orange-500 transition"
              >
                {fabricante}
              </button>
            ))
          }
        </Cinta>

      </Seccion>

    </div>
  );
}

// Tarjeta oscura de una categoría, con el ícono grande y transparente
// de fondo. `grande` para las destacadas.
function TarjetaCategoria({ nombre, grande = false, onClick }) {
  const Icono = ICONOS_CATEGORIA[nombre] || IconoCaja;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl bg-linear-to-br from-[#23272e] to-[#121417] border border-white/5 hover:border-orange-500/60 hover:-translate-y-0.5 hover:shadow-xl text-left flex flex-col justify-between transition duration-300 ${
        grande ? "h-44 p-6" : "h-32 p-4"
      }`}
    >
      <Icono
        className={`absolute text-white/5 group-hover:text-orange-500/15 transition duration-300 ${
          grande ? "-right-6 -bottom-6 w-40 h-40" : "-right-4 -bottom-4 w-24 h-24"
        }`}
      />

      <span
        className={`relative rounded-full bg-orange-500/15 text-orange-500 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition duration-300 ${
          grande ? "w-12 h-12" : "w-10 h-10"
        }`}
      >
        <Icono className={grande ? "w-6 h-6" : "w-5 h-5"} />
      </span>

      <span className="relative">
        <span className={`block text-white font-black ${grande ? "text-xl" : "text-sm"}`}>
          {nombre}
        </span>
        <span className="block text-orange-400 text-xs font-bold mt-1 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition duration-300">
          Ver repuestos →
        </span>
      </span>
    </button>
  );
}

// Cinta que se mueve sola. `children` es una función que arma los
// elementos: se llama dos veces (la segunda, copia oculta para lectores
// de pantalla y teclado) para que el bucle no tenga cortes.
function Cinta({ reversa = false, children }) {
  return (
    <div className="cinta-contenedor overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
      <div className={`cinta flex w-max ${reversa ? "cinta-reversa" : ""}`}>
        <div className="flex">{children(false)}</div>
        <div className="flex" aria-hidden="true">{children(true)}</div>
      </div>
    </div>
  );
}

// Todas las secciones del inicio tienen el mismo armado: mismo ancho y
// separación, etiqueta naranja, título y un enlace a la derecha. `gris`
// alterna el fondo para que se note dónde termina cada una.
function Seccion({ etiqueta, titulo, accion, onAccion, gris = false, children }) {
  return (
    <section className={gris ? "bg-[#f5f5f5]" : "bg-white"}>
      <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-14">

        <div className="flex items-end justify-between gap-4 mb-7">
          <div>
            <p className="text-orange-500 text-xs font-black tracking-[4px]">
              {etiqueta}
            </p>
            <h2 className="text-2xl md:text-3xl font-black italic uppercase mt-1">
              {titulo}
            </h2>
          </div>

          {accion && (
            <button
              type="button"
              onClick={onAccion}
              className="text-orange-500 text-sm font-bold hover:underline whitespace-nowrap"
            >
              {accion} →
            </button>
          )}
        </div>

        {children}

      </div>
    </section>
  );
}
