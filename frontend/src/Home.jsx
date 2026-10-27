import { useEffect, useState } from "react";
import { usarImagenGenerica } from "./mapearRepuesto";

import Navbar from "./Navbar";
import InvitacionAsistente from "./InvitacionAsistente";
import VehicleSelector from "./VehicleSelector";
import { obtenerCategorias, obtenerMasVendidos } from "./api";
import BotonAgregarCarrito from "./BotonAgregarCarrito";
import { useVehicle } from "./context/VehicleContext";
import repuestos from "./assets/repuestos.jpg";
import {
  IconoAuto,
  IconoCaja,
  IconoCambios,
  IconoCamion,
  IconoCarrito,
  IconoChispa,
  IconoCopoNieve,
  IconoDisco,
  IconoEngranaje,
  IconoEscape,
  IconoEscobilla,
  IconoFiltro,
  IconoGota,
  IconoRayo,
  IconoResorte,
  IconoTermometro,
  IconoVolante,
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
  Climatización: IconoCopoNieve,
  Dirección: IconoVolante,
  Eléctrico: IconoRayo,
  Encendido: IconoChispa,
  Escape: IconoEscape,
  Filtros: IconoFiltro,
  Frenos: IconoDisco,
  Lubricantes: IconoGota,
  Motor: IconoEngranaje,
  Refrigeración: IconoTermometro,
  Suspensión: IconoResorte,
  Transmisión: IconoCambios,
};

// Las que más se buscan van destacadas, más grandes, en una fila; el resto, de a 5 por fila
// (con las 14 categorías de hoy, 4 + 5 + 5: todas las filas completas).
const CATEGORIAS_DESTACADAS = ["Frenos", "Filtros", "Motor", "Suspensión"];

// Los pasos de "Cómo comprar".
const PASOS_COMPRA = [
  [IconoAuto, "Elegí tu auto", "Marca, modelo y año: te mostramos solo los repuestos que le sirven."],
  [IconoCarrito, "Agregá tus repuestos", "Compará fabricantes y precios, y sumalos al carrito."],
  [IconoCamion, "Pagá y recibilo", "Pagás de forma segura y te lo enviamos a todo el país."],
];

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

  const buscarRepuestos = (vehiculo) => {
    activarVehiculo(vehiculo);
    onCatalogo(null, vehiculo);
  };

  const borrarFiltros = () => {
    limpiarVehiculo();
  };

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

  // Las marcas del catálogo (los nombres, iguales que en el backend,
  // filtran el catálogo). Geely y JAC todavía no tienen logo.
  const simpleIcon = (slug) => `https://cdn.simpleicons.org/${slug}/000000`;
  const marcas = [
    { nombre: "Volkswagen", logo: VolkswagenLogo },
    { nombre: "Chevrolet", logo: ChevroletLogo },
    { nombre: "Fiat", logo: FiatLogo },
    { nombre: "Renault", logo: RenaultLogo },
    { nombre: "Ford", logo: simpleIcon("ford") },
    { nombre: "Toyota", logo: simpleIcon("toyota") },
    { nombre: "Peugeot", logo: PeugeotLogo },
    { nombre: "Nissan", logo: simpleIcon("nissan") },
    { nombre: "Suzuki", logo: SuzukiLogo },
    { nombre: "Hyundai", logo: HyundaiLogo },
    { nombre: "Kia", logo: simpleIcon("kia") },
    { nombre: "Citroen", logo: CitroenLogo },
    { nombre: "Chery", logo: CheryLogo },
    { nombre: "BYD", logo: BydLogo },
    { nombre: "Honda", logo: simpleIcon("honda") },
    { nombre: "Mitsubishi", logo: simpleIcon("mitsubishi") },
    { nombre: "Jeep", logo: simpleIcon("jeep") },
    { nombre: "Mazda", logo: simpleIcon("mazda") },
    { nombre: "GAC", logo: GacLogo },
    { nombre: "Mercedes-Benz", logo: MercedesLogo },
    { nombre: "BMW", logo: BMWLogo },
    { nombre: "Audi", logo: AudiLogo },
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

    obtenerMasVendidos({ limite: 8 })
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
            <VehicleSelector
              vehicle={vehiculoActivo}
              onConfirm={buscarRepuestos}
              onClear={borrarFiltros}
              showClear
              variant="home"
            />

          </div>

        </div>

      </section>

      {/* =====================================================
          ASISTENTE DE COMPRA (IA)
      ====================================================== */}

      <InvitacionAsistente />

      {/* =====================================================
          MARCAS Y FABRICANTES
          Debajo de Pit: confianza y un atajo por marca. Mismo armado que
          las demás secciones, pero más compacta. Dos
          cintas que se mueven solas, autos para un lado y fabricantes
          para el otro (ver .cinta en index.css).
      ====================================================== */}

      <section className="bg-white border-b border-gray-100">
        <div className="max-w-[1100px] mx-auto px-6 md:px-10 pt-10 pb-8">

          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <p className="text-orange-500 text-xs font-black tracking-[4px]">
                TRABAJAMOS CON
              </p>
              <h2 className="text-xl md:text-2xl font-black italic uppercase mt-1">
                Las mejores marcas
              </h2>
            </div>
            <button
              type="button"
              onClick={onMarcas}
              className="text-orange-500 text-sm font-bold hover:underline whitespace-nowrap"
            >
              Ver todas →
            </button>
          </div>

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

          <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mt-6 mb-3">
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

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(categorias || [])
            .filter((c) => CATEGORIAS_DESTACADAS.includes(c.nombre))
            .sort((a, b) => CATEGORIAS_DESTACADAS.indexOf(a.nombre) - CATEGORIAS_DESTACADAS.indexOf(b.nombre))
            .map((categoria) => (
              <TarjetaCategoria
                key={categoria.nombre}
                nombre={categoria.nombre}
                cantidad={categoria.cantidad}
                grande
                onClick={() => onCatalogo(categoria.nombre)}
              />
            ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
          {(categorias || [])
            .filter((c) => !CATEGORIAS_DESTACADAS.includes(c.nombre))
            .map((categoria) => (
              <TarjetaCategoria
                key={categoria.nombre}
                nombre={categoria.nombre}
                cantidad={categoria.cantidad}
                onClick={() => onCatalogo(categoria.nombre)}
              />
            ))}
        </div>

      </Seccion>

      {/* =====================================================
          CÓMO COMPRAR
      ====================================================== */}

      <Seccion
        gris
        etiqueta="ASÍ DE FÁCIL"
        titulo="Cómo comprar"
        accion="Empezar"
        onAccion={() => onCatalogo()}
      >
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PASOS_COMPRA.map(([Icono, titulo, texto], i) => (
            <li
              key={titulo}
              className="relative flex items-start gap-4 bg-white border border-gray-100 rounded-xl p-6 shadow-xs"
            >
              <span className="shrink-0 w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center">
                <Icono className="w-6 h-6" />
              </span>
              <div>
                <p className="text-xs font-black text-orange-500 tracking-[3px]">PASO {i + 1}</p>
                <h3 className="text-base font-black mt-1">{titulo}</h3>
                <p className="text-sm text-gray-500 mt-1">{texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </Seccion>

      {/* =====================================================
          MÁS VENDIDOS
      ====================================================== */}
      {/* Si no hay ventas o el pedido falla, la sección no se muestra. */}

      {masVendidos?.length !== 0 && (

        <Seccion
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

          {/* En celular, un carrusel que se desliza de costado; desde
              tablet, una grilla (dos filas de 4 en pantallas grandes). */}
          <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-6 px-6 sm:mx-0 sm:px-0 sm:pb-0 sm:overflow-visible sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">

            {(masVendidos ?? []).map((producto) => (

              <article
                key={producto.id}
                className="shrink-0 w-[75%] snap-start sm:w-auto flex flex-col bg-white border border-gray-100 rounded-xl overflow-hidden shadow-xs hover:shadow-lg transition"
              >

                <button
                  type="button"
                  onClick={() => onDetalle(producto)}
                  aria-label={`Ver ${producto.nombre}`}
                  className="relative h-44 bg-white"
                >
                  <img onError={usarImagenGenerica}
                    src={producto.imagen}
                    alt={producto.nombre}
                    className="w-full h-full object-contain p-3"
                  />
                </button>

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

                  <BotonAgregarCarrito
                    producto={producto}
                    className="w-full mt-3 flex items-center justify-center gap-2 h-9 rounded-md text-xs font-bold"
                  >
                    <IconoCarrito />
                    Agregar
                  </BotonAgregarCarrito>

                  <button
                    type="button"
                    onClick={() => onDetalle(producto)}
                    className="w-full h-9 mt-2 border border-gray-200 hover:border-orange-500 hover:text-orange-500 rounded-md text-xs font-bold transition"
                  >
                    VER REPUESTO
                  </button>

                </div>

              </article>

            ))}

          </div>

        </Seccion>

      )}


    </div>
  );
}

// Tarjeta oscura de una categoría, con el ícono grande y transparente
// de fondo. `grande` para las destacadas.
function TarjetaCategoria({ nombre, cantidad, grande = false, onClick }) {
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
        {/* La cantidad y, al pasar el mouse, "Ver repuestos" en su lugar. */}
        <span className="relative block h-4 mt-1 text-xs font-bold">
          {cantidad > 0 && (
            <span className="absolute inset-0 text-gray-400 group-hover:opacity-0 transition duration-300">
              {cantidad.toLocaleString("es-UY")} repuestos
            </span>
          )}
          <span className="absolute inset-0 text-orange-400 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition duration-300">
            Ver repuestos →
          </span>
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
