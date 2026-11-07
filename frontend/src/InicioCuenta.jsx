import { useNavigate } from "react-router-dom";

import CuentaLayout from "./CuentaLayout";
import { SECCIONES_CUENTA } from "./seccionesCuenta";

/**
 * "Mi cuenta" (/cuenta): el punto de entrada. En celular es solo el menú
 * (cada opción abre su sección); en pantallas grandes, al lado del menú,
 * cada sección con una línea que cuenta qué hay ahí.
 */
export default function InicioCuenta(propsNavbar) {
  const navigate = useNavigate();
  const nombre = propsNavbar.usuario?.nombre?.split(" ")[0];

  return (
    <CuentaLayout
      {...propsNavbar}
      titulo={nombre ? `Hola, ${nombre}` : "Mi cuenta"}
      descripcion="Desde acá manejás tus compras y tus datos."
    >
      <ul className="grid grid-cols-2 gap-4">
        {SECCIONES_CUENTA.map(({ clave, texto, descripcion, Icono, ruta }) => (
          <li key={clave}>
            <button
              type="button"
              onClick={() => navigate(ruta)}
              className="group w-full h-full flex items-start gap-4 bg-white border border-gray-200 rounded-xl p-5 text-left shadow-xs hover:border-orange-300 hover:shadow-md transition"
            >
              <span className="w-11 h-11 shrink-0 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition">
                <Icono className="w-5 h-5" />
              </span>
              <span>
                <span className="block text-base font-black">{texto}</span>
                <span className="block text-sm text-gray-500 mt-1">{descripcion}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </CuentaLayout>
  );
}
