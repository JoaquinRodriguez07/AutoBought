import { useEffect, useState } from "react";

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

    fetch(
      `http://127.0.0.1:8000/api/v1/models?brand=${encodeURIComponent(
        brand
      )}`
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error("Error fetching models");
        }

        return response.json();
      })
      .then((data) => {
        setModels(data.models || []);
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