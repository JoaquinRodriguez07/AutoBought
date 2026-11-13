// La página de inicio de la tienda.

import { useEffect, useRef, useState } from "react";
import { useGenericImage } from "./mapPart";

import Navbar from "./Navbar";
import AssistantInvite from "./AssistantInvite";
import VehicleSelector from "./VehicleSelector";
import { getCategories, getManufacturers, getBestSellers } from "./api";
import AddToCartButton from "./AddToCartButton";
import { isSeller } from "./auth";
import { useVehicle } from "./context/VehicleContext";
import repuestos from "./assets/repuestos.jpg";
import {
  CarIcon,
  BoxIcon,
  GearboxIcon,
  TruckIcon,
  CartIcon,
  SparkIcon,
  SnowflakeIcon,
  DiscIcon,
  GearIcon,
  ExhaustIcon,
  WiperIcon,
  FilterIcon,
  ArrowIcon,
  DropIcon,
  BoltIcon,
  SpringIcon,
  ThermometerIcon,
  SteeringWheelIcon,
} from "./Icons";

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
import HomeActiveOrders from "./HomeActiveOrders";

// Cuántos fabricantes muestra la cinta: los que más repuestos tienen.
const MANUFACTURER_COUNT = 8;

// Ícono de cada categoría. Las categorías vienen del servidor: una que no
// esté acá (nueva) se muestra con el ícono genérico, sin romper nada.
const CATEGORY_ICONS = {
  Accesorios: WiperIcon,
  Carrocería: CarIcon,
  Climatización: SnowflakeIcon,
  Dirección: SteeringWheelIcon,
  Eléctrico: BoltIcon,
  Encendido: SparkIcon,
  Escape: ExhaustIcon,
  Filtros: FilterIcon,
  Frenos: DiscIcon,
  Lubricantes: DropIcon,
  Motor: GearIcon,
  Refrigeración: ThermometerIcon,
  Suspensión: SpringIcon,
  Transmisión: GearboxIcon,
};

// Las que más se buscan van destacadas, más grandes, en una fila; el resto, de a 5 por fila
// (con las 14 categorías de hoy, 4 + 5 + 5: todas las filas completas).
// Las categorías grandes del mosaico: las que más repuestos tienen.
const FEATURED_COUNT = 4;

// Los pasos de "Cómo comprar".
const PURCHASE_STEPS = [
  [CarIcon, "Elegí tu auto", "Marca, modelo y año: te mostramos solo los repuestos que le sirven."],
  [CartIcon, "Agregá tus repuestos", "Compará fabricantes y precios, y sumalos al carrito."],
  [TruckIcon, "Pagá y recibilo", "Pagás de forma segura y te lo enviamos a todo el país."],
];

export default function Home({
  sessionUser,
  onHome,
  onLogin,
  onCatalogo,
  onDetail,
  onBrands,
  onCart,
  onFavorites,

  onProfile,
  onAddresses,
  onHistory,
  onCloseSession,
  onDeleteAccount,

  cartQuantity,
  favoritesQuantity,
}) {
  // ==========================================
  // VEHICLE SELECTION
  // ==========================================
  // Lo que se elige en los dropdowns es un BORRADOR local. Recién al
  // hacer clic en "Buscar Repuestos" pasa a ser el Vehículo Activo
  // (VehicleContext) y el catálogo consulta la API.

  const { activeVehicle, activateVehicle, clearVehicle } =
    useVehicle();


  const searchParts = (vehicle) => {
    activateVehicle(vehicle);
    onCatalogo(null, vehicle);
  };

  const clearFilters = () => {
    clearVehicle();
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

  const [categories, setCategories] = useState(null);
  const [manufacturers, setManufacturers] = useState([]);

  useEffect(() => {
    let active = true;

    getCategories()
      .then((list) => {
        if (!active) return;
        setCategories(list);
      })
      .catch(() => {
        if (!active) return;
        setCategories([]);
      });

    // Si falla, la cinta de fabricantes queda vacía.
    getManufacturers()
      .then((list) => {
        if (active) setManufacturers(list.slice(0, MANUFACTURER_COUNT).map((f) => f.displayName));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  // ==========================================
  // MARCAS
  // ==========================================

  // Las marcas del catálogo (los nombres, iguales que en el backend,
  // filtran el catálogo). Geely y JAC todavía no tienen logo.
  const simpleIcon = (slug) => `https://cdn.simpleicons.org/${slug}/000000`;
  const featured = [...(categories || [])]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, FEATURED_COUNT);

  const brands = [
    { displayName: "Volkswagen", logo: VolkswagenLogo },
    { displayName: "Chevrolet", logo: ChevroletLogo },
    { displayName: "Fiat", logo: FiatLogo },
    { displayName: "Renault", logo: RenaultLogo },
    { displayName: "Ford", logo: simpleIcon("ford") },
    { displayName: "Toyota", logo: simpleIcon("toyota") },
    { displayName: "Peugeot", logo: PeugeotLogo },
    { displayName: "Nissan", logo: simpleIcon("nissan") },
    { displayName: "Suzuki", logo: SuzukiLogo },
    { displayName: "Hyundai", logo: HyundaiLogo },
    { displayName: "Kia", logo: simpleIcon("kia") },
    { displayName: "Citroen", logo: CitroenLogo },
    { displayName: "Chery", logo: CheryLogo },
    { displayName: "BYD", logo: BydLogo },
    { displayName: "Honda", logo: simpleIcon("honda") },
    { displayName: "Mitsubishi", logo: simpleIcon("mitsubishi") },
    { displayName: "Jeep", logo: simpleIcon("jeep") },
    { displayName: "Mazda", logo: simpleIcon("mazda") },
    { displayName: "GAC", logo: GacLogo },
    { displayName: "Mercedes-Benz", logo: MercedesLogo },
    { displayName: "BMW", logo: BMWLogo },
    { displayName: "Audi", logo: AudiLogo },
  ];

  // ==========================================
  // PRODUCTOS MÁS VENDIDOS
  // ==========================================
  // Los más vendidos de los últimos 90 días que hoy tienen stock
  // (GET /api/v1/parts/best-sellers). `null` = todavía cargando.
  // Igual que las categorías: si no hay ventas o el pedido falla, la
  // sección se oculta y el resto de la página sigue funcionando.

  const [moreVendidos, setMoreVendidos] = useState(null);
  // El vendedor no compra: en «Más vendidos» no ve el botón «Agregar».
  const seller = isSeller(sessionUser);

  useEffect(() => {
    let active = true;

    getBestSellers({ limit: 8 })
      .then((list) => {
        if (!active) return;
        setMoreVendidos(list);
      })
      .catch(() => {
        if (!active) return;
        setMoreVendidos([]);
      });

    return () => {
      active = false;
    };
  }, []);

  const price = (rawValue) => `$${rawValue.toLocaleString("es-UY")}`;

  const hero = useRef(null);

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">

      {/* =====================================================
          NAVBAR
      ====================================================== */}

      <Navbar
        currentPage="home"
        sessionUser={sessionUser}
        onHome={onHome}
        onCatalogo={onCatalogo}
        onLogin={onLogin}
        onBrands={onBrands}
        onCart={onCart}
        onFavorites={onFavorites}
        onProfile={onProfile}
        onAddresses={onAddresses}
        onHistory={onHistory}
        onCloseSession={onCloseSession}
        onDeleteAccount={onDeleteAccount}
        cartQuantity={cartQuantity}
        favoritesQuantity={favoritesQuantity}
      />

      {/* =====================================================
          HERO + SELECTOR DE VEHÍCULO
      ====================================================== */}
      {/* La acción principal del inicio es elegir el auto: el selector
          va adentro del hero. Lo elegido es un borrador hasta tocar
          "Buscar repuestos" (ver arriba). */}

      <section ref={hero} className="relative overflow-hidden bg-black">

        {/* Oscurecida y corrida hacia abajo para que no se vean las
            partes blancas de la foto. Se acerca muy despacio al entrar. */}
        <img
          src={repuestos}
          alt="Repuestos para vehículos"
          className="absolute inset-0 w-full h-full object-cover object-bottom"
        />

        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 bg-linear-to-r from-black/90 via-black/65 to-black/35" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-black/70 to-transparent" />

        <div className="relative z-10 max-w-[1100px] mx-auto px-6 md:px-10 pt-28 md:pt-32 pb-16">

          {/* TÍTULO. Envíos, pago seguro y marcas ya los cuenta "Cómo
              comprar": acá no se repiten, así el banner entra en la
              pantalla también con los pedidos en curso. */}
          <div>
            <p className="text-orange-500 text-xs font-black tracking-[4px]">
              REPUESTOS PARA TU AUTO
            </p>

            {/* En celular las líneas se acomodan solas (parejas, sin
                palabras sueltas); desde tablet, una por renglón. */}
            <h1 className="text-white text-[2.5rem] sm:text-5xl md:text-6xl font-black italic uppercase leading-[0.95] mt-4 max-w-[640px] text-balance">
              {["Repuestos que te", "mantienen en", "movimiento"].map((line, indice) => (
                <span key={line} className={`sm:block ${indice === 2 ? "text-orange-500" : ""}`}>
                  {line}{" "}
                </span>
              ))}
            </h1>

            <p className="text-gray-300 text-base md:text-lg mt-5 max-w-[520px] leading-relaxed">
              Elegí tu auto y te mostramos los repuestos que le sirven,
              de las mejores marcas.
            </p>
          </div>

          {/* SELECTOR DE VEHÍCULO */}

          <div className="mt-8 bg-[#151719]/95 border border-white/10 rounded-xl shadow-2xl p-5 md:p-6">

            <p className="text-white text-sm font-black">¿Qué auto tenés?</p>
            <VehicleSelector
              vehicle={activeVehicle}
              onConfirm={searchParts}
              onClear={clearFilters}
              showClear
              variant="home"
            />

          </div>

          {/* PEDIDOS EN CURSO: solo con sesión y pedidos en curso */}
          <HomeActiveOrders />

        </div>

        <ScrollHint hero={hero} />

      </section>

      {/* =====================================================
          ASISTENTE DE COMPRA (IA)
      ====================================================== */}

      <AssistantInvite />

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
              onClick={onBrands}
              className="text-orange-500 text-sm font-bold hover:underline whitespace-nowrap"
            >
              Ver todas →
            </button>
          </div>

          <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-3">
            Repuestos para tu auto
          </p>

          <Ribbon>
            {(copia) =>
              brands.map((marca) => (
                <button
                  key={marca.displayName}
                  type="button"
                  tabIndex={copia ? -1 : undefined}
                  onClick={() => onCatalogo(null, null, { marca: marca.displayName })}
                  title={marca.displayName}
                  aria-label={`Ver repuestos de ${marca.displayName}`}
                  className="group shrink-0 w-36 h-14 flex items-center justify-center"
                >
                  {marca.logo ? (
                    <img
                      src={marca.logo}
                      alt={`Logo ${marca.displayName}`}
                      className="max-h-10 max-w-[72px] object-contain grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition duration-300"
                    />
                  ) : (
                    <span className="text-sm font-black text-gray-400 group-hover:text-gray-900">
                      {marca.displayName}
                    </span>
                  )}
                </button>
              ))
            }
          </Ribbon>

          <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mt-6 mb-3">
            Fabricantes de repuestos
          </p>

          <Ribbon reversa>
            {(copia) =>
              manufacturers.map((fabricante) => (
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
          </Ribbon>

        </div>
      </section>

      {/* =====================================================
          CATEGORÍAS
      ====================================================== */}

      <Section
        label="TODO PARA TU AUTO"
        title="Categorías"
        action="Ver todas"
        onAction={() => onCatalogo()}
      >

        {categories === null && (
          <p className="text-sm text-gray-400">
            Cargando categorías…
          </p>
        )}

        {/* Mosaico: las destacadas grandes arriba y el resto debajo. */}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {featured
            .map((categoria) => (
              <CategoryCard
                key={categoria.displayName}
                displayName={categoria.displayName}
                quantity={categoria.quantity}
                large
                onClick={() => onCatalogo(categoria.displayName)}
              />
            ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
          {(categories || [])
            .filter((c) => !featured.includes(c))
            .map((categoria) => (
              <CategoryCard
                key={categoria.displayName}
                displayName={categoria.displayName}
                quantity={categoria.quantity}
                onClick={() => onCatalogo(categoria.displayName)}
              />
            ))}
        </div>

      </Section>

      {/* =====================================================
          CÓMO COMPRAR
      ====================================================== */}

      <Section
        gris
        label="ASÍ DE FÁCIL"
        title="Cómo comprar"
        action="Empezar"
        onAction={() => onCatalogo()}
      >
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PURCHASE_STEPS.map(([Icon, title, texto], i) => (
            <li
              key={title}
              className="relative flex items-start gap-4 bg-white border border-gray-100 rounded-xl p-6 shadow-xs"
            >
              <span className="shrink-0 w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center">
                <Icon className="w-6 h-6" />
              </span>
              <div>
                <p className="text-xs font-black text-orange-500 tracking-[3px]">PASO {i + 1}</p>
                <h3 className="text-base font-black mt-1">{title}</h3>
                <p className="text-sm text-gray-500 mt-1">{texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* =====================================================
          MÁS VENDIDOS
      ====================================================== */}
      {/* Si no hay ventas o el pedido falla, la sección no se muestra. */}

      {moreVendidos?.length !== 0 && (

        <Section
          label="LO MÁS ELEGIDO"
          title="Más vendidos"
          action="Ver más"
          onAction={() => onCatalogo()}
        >

          {moreVendidos === null && (
            <p className="text-sm text-gray-400">
              Cargando más vendidos…
            </p>
          )}

          {/* En celular, un carrusel que se desliza de costado; desde
              tablet, una grilla (dos filas de 4 en pantallas grandes). */}
          <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-6 px-6 sm:mx-0 sm:px-0 sm:pb-0 sm:overflow-visible sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">

            {(moreVendidos ?? []).map((product) => (

              /* Toda la tarjeta lleva al repuesto: el nombre es el botón y
                 su ::after la cubre entera. "Agregar" queda por encima. */
              <article
                key={product.id}
                className="group relative shrink-0 w-[75%] snap-start sm:w-auto flex flex-col bg-white border border-gray-100 rounded-xl overflow-hidden shadow-xs hover:shadow-lg hover:border-gray-200 transition"
              >

                <div className="h-44 bg-white">
                  <img onError={useGenericImage}
                    src={product.image}
                    alt=""
                    className="w-full h-full object-contain p-3 group-hover:scale-105 transition duration-300"
                  />
                </div>

                {/* flex + mt-auto: el botón queda abajo aunque el
                    nombre ocupe una o dos líneas. */}
                <div className="flex flex-col flex-1 p-4">

                  <p className="text-xs uppercase tracking-wide text-orange-500 font-black">
                    {product.fabricante}
                  </p>

                  <h3 className="text-sm font-bold mt-1 leading-snug">
                    <button
                      type="button"
                      onClick={() => onDetail(product)}
                      className="text-left group-hover:text-orange-500 transition after:absolute after:inset-0 after:content-['']"
                    >
                      {product.displayName}
                    </button>
                  </h3>

                  <p className="text-xl font-black mt-auto pt-4">
                    {price(product.price)}
                  </p>

                  {/* El vendedor no compra: ve los productos, sin el botón. */}
                  {!seller && (
                    <AddToCartButton
                      product={product}
                      className="relative z-10 w-full mt-3 flex items-center justify-center gap-2 h-10 rounded-md text-xs font-bold"
                    >
                      <CartIcon />
                      Agregar
                    </AddToCartButton>
                  )}

                </div>

              </article>

            ))}

          </div>

        </Section>

      )}

    </div>
  );
}

// Flechita al pie del banner, centrada, que avisa que la página sigue; al
// tocarla baja hasta lo que viene después. Va en el margen de abajo del
// banner, así no tapa nada. Sin animaciones.
function ScrollHint({ hero }) {
  const bajar = () => {
    const high = hero.current?.offsetHeight ?? window.innerHeight;
    window.scrollTo({ top: high - 88, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      onClick={bajar}
      aria-label="Ver más del inicio"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 w-9 h-9 rounded-full bg-white/10 border border-white/25 text-white flex items-center justify-center hover:bg-orange-500 hover:border-orange-500 transition"
    >
      <ArrowIcon className="w-5 h-5" />
    </button>
  );
}

// Tarjeta oscura de una categoría, con el ícono grande y transparente
// de fondo. `grande` para las destacadas.
function CategoryCard({ displayName, quantity, large = false, onClick }) {
  const Icon = CATEGORY_ICONS[displayName] || BoxIcon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl bg-linear-to-br from-[#23272e] to-[#121417] border border-white/5 hover:border-orange-500/60 hover:-translate-y-0.5 hover:shadow-xl text-left flex flex-col justify-between transition duration-300 ${
        large ? "h-44 p-6" : "h-32 p-4"
      }`}
    >
      <Icon
        className={`absolute text-white/5 group-hover:text-orange-500/15 transition duration-300 ${
          large ? "-right-6 -bottom-6 w-40 h-40" : "-right-4 -bottom-4 w-24 h-24"
        }`}
      />

      <span
        className={`relative rounded-full bg-orange-500/15 text-orange-500 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition duration-300 ${
          large ? "w-12 h-12" : "w-10 h-10"
        }`}
      >
        <Icon className={large ? "w-6 h-6" : "w-5 h-5"} />
      </span>

      <span className="relative">
        <span className={`block text-white font-black ${large ? "text-xl" : "text-sm"}`}>
          {displayName}
        </span>
        {/* La cantidad y, al pasar el mouse, "Ver repuestos" en su lugar. */}
        <span className="relative block h-4 mt-1 text-xs font-bold">
          {quantity > 0 && (
            <span className="absolute inset-0 text-gray-400 group-hover:opacity-0 transition duration-300">
              {quantity.toLocaleString("es-UY")} repuestos
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
function Ribbon({ reversa = false, children }) {
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
function Section({ label, title, action, onAction, gris = false, children }) {
  return (
    <section className={gris ? "bg-[#f5f5f5]" : "bg-white"}>
      <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-14">

        <div className="flex items-end justify-between gap-4 mb-7">
          <div>
            <p className="text-orange-500 text-xs font-black tracking-[4px]">
              {label}
            </p>
            <h2 className="text-2xl md:text-3xl font-black italic uppercase mt-1">
              {title}
            </h2>
          </div>

          {action && (
            <button
              type="button"
              onClick={onAction}
              className="text-orange-500 text-sm font-bold hover:underline whitespace-nowrap"
            >
              {action} →
            </button>
          )}
        </div>

        {children}

      </div>
    </section>
  );
}
