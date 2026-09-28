import { useEffect, useState } from "react";

function BrandDropdown({
  value,
  onChange,
  className = "",
}) {
  const [brands, setBrands] = useState([]);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/v1/brands")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Error fetching brands");
        }

        return response.json();
      })
      .then((data) => {
        setBrands(data.brands || []);
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