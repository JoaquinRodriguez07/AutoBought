import { useEffect, useState } from "react";
import { obtenerModelos } from "./api";

function ModelDropdown({
  brand,
  value,
  onChange,
  className = "",
}) {
  const [models, setModels] = useState([]);

  useEffect(() => {
    if (!brand) {
      setModels([]);
      return;
    }

    obtenerModelos(brand)
      .then((data) => {
        setModels(data);
      })
      .catch((error) => {
        console.error("Error fetching models:", error);
        setModels([]);
      });
  }, [brand]);

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={!brand}
      className={`${className} ${
        !brand ? "bg-gray-200 text-gray-400 cursor-not-allowed" : ""
      }`}
    >
      <option value="">
        {brand ? "Selecciona tu Modelo" : "Selecciona una Marca primero"}
      </option>

      {models.map((model) => (
        <option key={model} value={model}>
          {model}
        </option>
      ))}
    </select>
  );
}

export default ModelDropdown;