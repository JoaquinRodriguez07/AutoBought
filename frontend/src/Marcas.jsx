import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import { obtenerMarcas } from "./api";
import EncabezadoPagina from "./EncabezadoPagina";

import AudiLogo from "./assets/Logos Vehiculos/Audi.svg";
import BMWLogo from "./assets/Logos Vehiculos/BMW.png";
import BYDLogo from "./assets/Logos Vehiculos/Byd.png";
import CheryLogo from "./assets/Logos Vehiculos/Chery.webp";
import ChevroletLogo from "./assets/Logos Vehiculos/Chevrolet.png";
import CitroenLogo from "./assets/Logos Vehiculos/Citroen.png";
import FiatLogo from "./assets/Logos Vehiculos/Fiat.png";
import HyundaiLogo from "./assets/Logos Vehiculos/Hyundai.webp";
import PeugeotLogo from "./assets/Logos Vehiculos/Peugeot.webp";
import RenaultLogo from "./assets/Logos Vehiculos/Renault.png";

const logoMap = {
  Volkswagen: "https://cdn.simpleicons.org/volkswagen/000000",
  Chevrolet: ChevroletLogo,
  Fiat: FiatLogo,
  Renault: RenaultLogo,
  Ford: "https://cdn.simpleicons.org/ford/000000",
  Toyota: "https://cdn.simpleicons.org/toyota/000000",
  Peugeot: PeugeotLogo,
  Citroen: CitroenLogo,
  "Citroën": CitroenLogo,
  Nissan: "https://cdn.simpleicons.org/nissan/000000",
  Hyundai: HyundaiLogo,
  Kia: "https://cdn.simpleicons.org/kia/000000",
  Suzuki: "https://cdn.simpleicons.org/suzuki/000000",
  Honda: "https://cdn.simpleicons.org/honda/000000",
  BMW: BMWLogo,
  "Mercedes-Benz": "https://cdn.simpleicons.org/mercedes/000000",
  Audi: AudiLogo,
  Jeep: "https://cdn.simpleicons.org/jeep/000000",
  Mitsubishi: "https://cdn.simpleicons.org/mitsubishi/000000",
  Chery: CheryLogo,
  BYD: BYDLogo,
};

export default function Marcas({
  usuario,
  onHome,
  onCatalogo,
  onLogin,
  onMarcas,
  onCarrito,
  onFavoritos,
  cantidadCarrito,
  cantidadFavoritos,
  onPerfil,
  onDirecciones,
  onMetodosPago,
  onHistorial,
  onCerrarSesion,
}) {
  const [marcas, setMarcas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    obtenerMarcas()
      .then((data) => {
        setMarcas(data);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching brands:", error);
        setError(true);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">

      {/* NAVBAR */}

      <Navbar
        paginaActual="marcas"
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

      {/* CONTENIDO */}

      <main>

        {/* ENCABEZADO: el mismo de catálogo, carrito y la cuenta */}

        <EncabezadoPagina
          migas={[{ texto: "Inicio", ir: onHome }, "Marcas"]}
          titulo="Marcas"
          descripcion="Elegí la marca de tu auto y te mostramos los repuestos que le sirven."
        />

        {/* MARCAS */}

        <section className="max-w-[1100px] mx-auto px-6 py-12 box-content">

          <div className="flex items-center justify-between mb-7">

            <div>

              <h2 className="text-xl font-black uppercase">
                Marcas disponibles
              </h2>

              <p className="text-sm text-gray-400 mt-1">
                Trabajamos con las principales marcas de vehículos.
              </p>

            </div>

            <span className="text-sm text-gray-400">
              {loading ? "Cargando..." : `${marcas.length} marcas`}
            </span>

          </div>

          {/* ERROR */}

          {error && (
            <div className="bg-white border border-red-200 rounded-xl p-6 text-center">
              <p className="text-sm font-bold text-red-500">
                No se pudieron cargar las marcas.
              </p>

              <p className="text-xs text-gray-400 mt-2">
                Verificá que el backend esté funcionando.
              </p>
            </div>
          )}

          {/* CARGANDO */}

          {loading && !error && (
            <div className="bg-white rounded-xl p-10 text-center">
              <p className="text-sm text-gray-400">
                Cargando marcas...
              </p>
            </div>
          )}

          {/* MARCAS */}

          {!loading && !error && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">

              {marcas.map((marca) => {

                const logo = logoMap[marca.brand];

                return (
                  <button
                    key={marca.brand}
                    type="button"
                    onClick={() => onCatalogo(null, null, { marca: marca.brand })}
                    // Solo el logo; al pasar el mouse (o con el teclado) el
                    // logo sube y aparece "Ver repuestos". El nombre, en el
                    // cartelito del navegador al dejar el mouse encima.
                    title={marca.brand}
                    aria-label={`Ver repuestos de ${marca.brand}`}
                    className="group relative overflow-hidden bg-white border border-gray-100 rounded-xl h-[130px] flex items-center justify-center shadow-xs hover:shadow-lg hover:border-orange-300 focus-visible:border-orange-300 outline-hidden transition duration-300"
                  >

                    <div className="h-16 w-28 flex items-center justify-center transition duration-300 group-hover:-translate-y-3 group-hover:scale-90 group-focus-visible:-translate-y-3 group-focus-visible:scale-90">

                      {logo ? (
                        <img
                          src={logo}
                          alt={`Logo ${marca.brand}`}
                          className="max-h-14 max-w-24 object-contain grayscale group-hover:grayscale-0 transition duration-300"
                        />
                      ) : (
                        <span className="text-lg font-black">
                          {marca.brand}
                        </span>
                      )}

                    </div>

                    <div
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-2.5 text-center opacity-0 translate-y-2 transition duration-300 group-hover:opacity-100 group-hover:translate-y-0 group-focus-visible:opacity-100 group-focus-visible:translate-y-0"
                    >
                      <p className="text-xs font-bold text-orange-500">
                        Ver repuestos →
                      </p>
                    </div>

                  </button>
                );
              })}

            </div>
          )}

        </section>

        {/* BANNER */}

        <section className="max-w-[1100px] mx-auto px-6 pb-14 box-content">

          <div className="bg-[#171b20] rounded-2xl px-7 md:px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-5">

            <div>

              <p className="text-orange-500 text-xs font-black tracking-[3px]">
                ¿NO ENCONTRÁS TU MARCA?
              </p>

              <h2 className="text-white text-xl md:text-2xl font-black italic uppercase mt-2">
                BUSCÁ DIRECTAMENTE TU REPUESTO
              </h2>

              <p className="text-gray-400 text-sm mt-2">
                Nuestro catálogo se actualiza constantemente.
              </p>

            </div>

            <button
              type="button"
              onClick={() => onCatalogo()}
              className="bg-orange-500 hover:bg-orange-600 text-white px-7 py-3 rounded-lg text-sm font-black transition whitespace-nowrap"
            >
              VER REPUESTOS →
            </button>

          </div>

        </section>

      </main>

    </div>
  );
}