import { useEffect, useState } from "react";
import { obtenerMarcas } from "./api";

function BrandDropdown({
  value,
  onChange,
  className = "",
}) {
  const [brands, setBrands] = useState([]);

  useEffect(() => {
    obtenerMarcas()
      .then((data) => {
        setBrands(data);
      })
      .catch((error) => {
        console.error("Error fetching brands:", error);
        setBrands([]);
      });
  }, []);

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    >
      <option value="">
        Selecciona tu Marca
      </option>

      {brands.map((brand) => (
        <option key={brand.brand} value={brand.brand}>
          {brand.brand}
        </option>
      ))}
    </select>
  );
}

export default BrandDropdown;