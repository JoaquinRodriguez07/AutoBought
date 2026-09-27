import { useEffect, useState } from "react";
import Navbar from "./Navbar";

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
    const apiBaseUrl =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
        ? "http://127.0.0.1:8000"
        : "";

    fetch(`${apiBaseUrl}/api/v1/brands`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Error fetching brands");
        }

        return response.json();
      })
      .then((data) => {
        setMarcas(data.brands);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching brands:", error);
        setError(true);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#f7f7f7] text-gray-900 font-sans">

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

      <main className="pt-[105px]">

        {/* ENCABEZADO */}

        <section className="bg-white px-6 py-14">

          <div className="max-w-[1100px] mx-auto">

            <p className="text-orange-500 text-[10px] font-black tracking-[4px]">
              ENCONTRÁ TU VEHÍCULO
            </p>

            <h1 className="text-4xl md:text-5xl font-black italic uppercase mt-2">
              MARCAS
            </h1>

            <p className="text-gray-500 text-sm max-w-[600px] mt-4 leading-relaxed">
              Seleccioná la marca de tu vehículo para encontrar
              los repuestos compatibles disponibles en AutoBought.
            </p>

          </div>

        </section>

        {/* MARCAS */}

        <section className="max-w-[1100px] mx-auto px-6 py-12">

          <div className="flex items-center justify-between mb-7">

            <div>

              <h2 className="text-xl font-black uppercase">
                Marcas disponibles
              </h2>

              <p className="text-[10px] text-gray-400 mt-1">
                Trabajamos con las principales marcas de vehículos.
              </p>

            </div>

            <span className="text-[10px] text-gray-400">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">

              {marcas.map((marca) => {

                const logo = logoMap[marca.brand];

                return (
                  <button
                    key={marca.brand}
                    type="button"
                    onClick={() =>
                      onCatalogo(null, {
                        brand: marca.brand,
                        model: "",
                        year: "",
                      })
                    }
                    className="group bg-white border border-gray-100 rounded-xl h-[145px] flex flex-col items-center justify-center shadow-sm hover:shadow-lg hover:border-orange-300 hover:-translate-y-1 transition duration-300"
                  >

                    <div className="h-16 w-28 flex items-center justify-center">

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

                    <p className="text-[11px] font-bold mt-5 group-hover:text-orange-500 transition">
                      {marca.brand}
                    </p>

                    <p className="text-[8px] text-gray-400 mt-1">
                      Ver repuestos →
                    </p>

                  </button>
                );
              })}

            </div>
          )}

        </section>

        {/* BANNER */}

        <section className="max-w-[1100px] mx-auto px-6 pb-14">

          <div className="bg-[#171b20] rounded-2xl px-7 md:px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-5">

            <div>

              <p className="text-orange-500 text-[9px] font-black tracking-[3px]">
                ¿NO ENCONTRÁS TU MARCA?
              </p>

              <h2 className="text-white text-xl md:text-2xl font-black italic uppercase mt-2">
                BUSCÁ DIRECTAMENTE TU REPUESTO
              </h2>

              <p className="text-gray-400 text-[10px] mt-2">
                Nuestro catálogo se actualiza constantemente.
              </p>

            </div>

            <button
              type="button"
              onClick={() => onCatalogo()}
              className="bg-orange-500 hover:bg-orange-600 text-white px-7 py-3 rounded-lg text-[10px] font-black transition whitespace-nowrap"
            >
              VER REPUESTOS →
            </button>

          </div>

        </section>

      </main>

    </div>
  );
}