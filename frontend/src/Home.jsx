import { useEffect, useState } from "react";

import Navbar from "./Navbar";
import BrandDropdown from "./BrandDropdown";
import ModelDropdown from "./ModelDropdown";
import { obtenerCategorias } from "./api";
import { useVehicle } from "./context/VehicleContext";

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

export default function Home({
  usuario,
  onHome,
  onLogin,
  onCatalogo,
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

    activarVehiculo({
      brand: selectedBrand,
      model: selectedModel,
      year: selectedYear,
    });

    onCatalogo();
  };

  // El botón grande del hero aplica el vehículo si la selección está
  // completa; si no, simplemente abre el catálogo tal como esté.
  const buscarDesdeHero = () => {
    if (puedeBuscar) {
      buscarRepuestos();
    } else {
      onCatalogo();
    }
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

    const cargarAnios = async () => {
      try {
        setLoadingYears(true);

        const response = await fetch(
          `/api/v1/years?brand=${encodeURIComponent(
            selectedBrand
          )}&model=${encodeURIComponent(selectedModel)}`
        );

        if (!response.ok) {
          throw new Error("No se pudieron obtener los años");
        }

        const data = await response.json();

        setYears(data.years || []);
      } catch (error) {
        console.error("Error cargando años:", error);
        setYears([]);
      } finally {
        setLoadingYears(false);
      }
    };

    cargarAnios();
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
  /* =========================================================
     PRODUCTOS MÁS VENDIDOS
     Mock local: no son filas reales del backend, así que no
     tienen categoría (ninguna coincidiría con las del catálogo).
     Por eso "VER REPUESTOS" abre el catálogo completo.
  ========================================================== */

  const productos = [
    {
      marca: "BOSCH",
      nombre: "Pastillas de Freno Delanteras",
      codigo: "BP1234",
      precio: "$2.450",
      imagen:
        "https://images.unsplash.com/photo-1530046339160-ce3e530c7d2f?q=80&w=600&auto=format&fit=crop",
    },
    {
      marca: "BREMBO",
      nombre: "Discos de Freno Delanteros",
      codigo: "BRD1234",
      precio: "$4.200",
      imagen:
        "https://images.unsplash.com/photo-1504215680853-026ed2a45def?q=80&w=600&auto=format&fit=crop",
    },
    {
      marca: "MANN FILTER",
      nombre: "Filtro de Aire",
      codigo: "MF4587",
      precio: "$1.290",
      imagen:
        "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?q=80&w=600&auto=format&fit=crop",
    },
    {
      marca: "MONROE",
      nombre: "Amortiguador Delantero",
      codigo: "MN7821",
      precio: "$5.890",
      imagen:
        "https://images.unsplash.com/photo-1487754180451-c456f719a1fc?q=80&w=600&auto=format&fit=crop",
    },
  ];

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
          HERO
      ====================================================== */}

      <section className="relative min-h-[620px] flex items-center overflow-hidden">

        <img
          src="/src/assets/repuestos.jpg"
          alt="Repuestos para vehículos"
          className="absolute inset-0 w-full h-full object-cover"
        />

        <div className="absolute inset-0 bg-black/65" />

        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/20" />

        <div className="relative z-10 max-w-[1200px] w-full mx-auto px-6 md:px-10 pt-20">

          <div className="max-w-[650px]">

            <p className="text-orange-500 text-[10px] md:text-xs font-black tracking-[5px] mb-5">
              PREMIUM PERFORMANCE PARTS
            </p>

            <h1 className="text-white text-4xl md:text-6xl font-black italic uppercase leading-[0.95]">
              REPUESTOS QUE TE
              <br />
              MANTIENEN EN
              <br />
              MOVIMIENTO
            </h1>

            <p className="text-gray-300 text-sm md:text-base mt-7 max-w-[540px] leading-relaxed">
              Calidad, confianza y las mejores marcas en un solo
              lugar. Encontrá el repuesto exacto para potenciar
              el rendimiento de tu vehículo.
            </p>

            <button
              type="button"
              onClick={buscarDesdeHero}
              className="mt-8 bg-orange-500 hover:bg-orange-600 text-white px-8 py-4 rounded-lg text-[11px] font-black transition"
            >
              BUSCAR REPUESTOS →
            </button>

          </div>

          <div className="absolute hidden lg:block right-10 bottom-16 text-white/30 text-[9px] tracking-[5px] leading-[1.8]">
            <p>TU AUTO</p>
            <p>NUESTRA</p>
            <p>PASIÓN</p>
          </div>

        </div>
      </section>

      {/* =====================================================
          SELECTOR DE VEHÍCULO
      ====================================================== */}

      <section className="relative z-20 -mt-10 px-5">

        <div className="max-w-[1050px] mx-auto bg-[#151719] rounded-xl shadow-2xl p-5 md:p-7">

          <div className="flex flex-col md:flex-row md:items-end gap-4">

            {/* MARCA */}

            <div className="flex-1">

              <p className="text-[9px] text-gray-400 font-bold mb-2">
                MARCA
              </p>

              <BrandDropdown
                value={selectedBrand}
                onChange={handleBrandChange}
                className="w-full bg-white rounded-md px-3 py-3 text-[10px] outline-none"
              />

            </div>

            {/* MODELO */}

            <div className="flex-1">

              <p className="text-[9px] text-gray-400 font-bold mb-2">
                MODELO
              </p>

              <ModelDropdown
                brand={selectedBrand}
                value={selectedModel}
                onChange={handleModelChange}
                className="w-full bg-white rounded-md px-3 py-3 text-[10px] outline-none"
              />

            </div>

            {/* AÑO */}

            <div className="flex-1">

              <p className="text-[9px] text-gray-400 font-bold mb-2">
                AÑO
              </p>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                disabled={!selectedModel || loadingYears}
                className="w-full bg-white rounded-md px-3 py-3 text-[10px] outline-none disabled:bg-gray-200 disabled:text-gray-400"
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

            </div>

            <button
              type="button"
              onClick={buscarRepuestos}
              disabled={!puedeBuscar}
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-md px-7 py-3 text-[10px] font-black transition disabled:bg-gray-500 disabled:text-gray-300 disabled:hover:bg-gray-500 disabled:cursor-not-allowed"
            >
              BUSCAR REPUESTOS
            </button>

            <button
              type="button"
              onClick={borrarFiltros}
              disabled={!hayAlgoParaBorrar}
              className="border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white rounded-md px-5 py-3 text-[10px] font-black transition disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-orange-500 disabled:cursor-not-allowed"
            >
              BORRAR FILTROS
            </button>

          </div>

        </div>
      </section>

      {/* =====================================================
          CATEGORÍAS
      ====================================================== */}

      <section className="max-w-[1100px] mx-auto px-6 md:px-10 pt-16">

        <div className="flex items-end justify-between mb-9">

          <div>

            <p className="text-orange-500 text-[9px] font-black tracking-[4px]">
              TODO PARA TU AUTO
            </p>

            <h2 className="text-2xl md:text-3xl font-black italic uppercase mt-2">
              ENCONTRÁ LO QUE NECESITÁS
            </h2>

          </div>

          <button
            type="button"
            onClick={() => onCatalogo()}
            className="text-orange-500 text-[10px] font-bold hover:underline"
          >
            Ver todas →
          </button>

        </div>

        {categorias === null && (
          <p className="text-[10px] text-gray-400">
            Cargando categorías…
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">

          {(categorias || []).map((categoria) => (

            <button
              key={categoria.nombre}
              type="button"
              onClick={() => onCatalogo(categoria.nombre)}
              className="h-24 bg-white border border-gray-200 rounded-xl hover:border-orange-400 hover:shadow-md hover:-translate-y-1 transition duration-300 flex items-center justify-center"
            >
              <p className="text-[10px] font-bold">
                {categoria.nombre}
              </p>
            </button>

          ))}

        </div>

      </section>

      {/* =====================================================
          MARCAS
      ====================================================== */}

      <section className="max-w-[1100px] mx-auto px-6 md:px-10 py-16">

        <div className="flex items-end justify-between mb-7">

          <div>

            <p className="text-orange-500 text-[9px] font-black tracking-[4px]">
              TRABAJAMOS CON
            </p>

            <h2 className="text-2xl font-black italic uppercase mt-1">
              LAS MEJORES MARCAS
            </h2>

          </div>

          <button
            type="button"
            onClick={onMarcas}
            className="text-orange-500 text-[10px] font-bold hover:underline"
          >
            Ver todas →
          </button>

        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">

          {marcas.map((marca) => (

            <button
              key={marca.nombre}
              type="button"
              onClick={onMarcas}
              className="h-24 bg-gray-50 border border-gray-100 rounded-lg flex flex-col items-center justify-center hover:bg-white hover:border-orange-300 hover:shadow-md transition duration-300 group"
            >

              {marca.logo ? (

                <div className="h-12 w-24 flex items-center justify-center">

                  <img
                    src={marca.logo}
                    alt={`Logo ${marca.nombre}`}
                    className="max-h-11 max-w-[85px] object-contain group-hover:scale-105 transition duration-300"
                  />

                </div>

              ) : (

                <div className="h-12 flex items-center justify-center">

                  <span className="text-[11px] font-black text-gray-500 group-hover:text-orange-500 transition">
                    {marca.nombre}
                  </span>

                </div>

              )}

              <span className="text-[8px] text-gray-500 font-semibold mt-1">
                {marca.nombre}
              </span>

            </button>

          ))}

        </div>

      </section>

      {/* =====================================================
          MÁS VENDIDOS
      ====================================================== */}

      <section className="max-w-[1150px] mx-auto px-5 md:px-8 pb-16">

        <div className="bg-[#f3f3f3] rounded-2xl p-6 md:p-9">

          <div className="flex items-end justify-between mb-7">

            <div>

              <p className="text-orange-500 text-[9px] font-black tracking-[4px]">
                LO MÁS ELEGIDO
              </p>

              <h2 className="text-2xl md:text-3xl font-black italic uppercase mt-1">
                MÁS VENDIDOS
              </h2>

            </div>

            <button
              type="button"
              onClick={() => onCatalogo()}
              className="text-orange-500 text-[10px] font-bold hover:underline"
            >
              Ver más →
            </button>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {productos.map((producto) => (

              <div
                key={producto.codigo}
                className="bg-white rounded-xl overflow-hidden border border-gray-100 hover:shadow-lg transition"
              >

                <div className="h-48 bg-gray-100 overflow-hidden">

                  <img
                    src={producto.imagen}
                    alt={producto.nombre}
                    className="w-full h-full object-cover"
                  />

                </div>

                <div className="p-4">

                  <p className="text-[9px] text-orange-500 font-black">
                    {producto.marca}
                  </p>

                  <h3 className="text-[12px] font-bold mt-1">
                    {producto.nombre}
                  </h3>

                  <p className="text-[9px] text-gray-400 mt-1">
                    Código: {producto.codigo}
                  </p>

                  <p className="text-lg font-black mt-4">
                    {producto.precio}
                  </p>

                  <button
                    type="button"
                    onClick={() => onCatalogo()}
                    className="w-full mt-3 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white rounded-md py-2 text-[9px] font-bold transition"
                  >
                    VER REPUESTOS
                  </button>

                </div>

              </div>

            ))}

          </div>

        </div>

      </section>

      {/* =====================================================
          BENEFICIOS
      ====================================================== */}

      <section className="bg-[#151719]">

        <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-12 grid grid-cols-1 md:grid-cols-3 gap-8">

          <div>

            <p className="text-orange-500 text-xl">
              ✓
            </p>

            <h3 className="text-white text-[11px] font-black mt-2">
              REPUESTOS DE CALIDAD
            </h3>

            <p className="text-gray-500 text-[9px] mt-2">
              Trabajamos con marcas reconocidas.
            </p>

          </div>

          <div>

            <p className="text-orange-500 text-xl">
              ✓
            </p>

            <h3 className="text-white text-[11px] font-black mt-2">
              COMPATIBILIDAD
            </h3>

            <p className="text-gray-500 text-[9px] mt-2">
              Encontrá piezas compatibles con tu vehículo.
            </p>

          </div>

          <div>

            <p className="text-orange-500 text-xl">
              ✓
            </p>

            <h3 className="text-white text-[11px] font-black mt-2">
              ENVÍOS A TODO EL PAÍS
            </h3>

            <p className="text-gray-500 text-[9px] mt-2">
              Recibí tus repuestos donde estés.
            </p>

          </div>

        </div>

      </section>

    </div>
  );
}