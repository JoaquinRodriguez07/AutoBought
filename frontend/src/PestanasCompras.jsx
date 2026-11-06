import { useNavigate } from "react-router-dom";

import { usePedidos } from "./context/PedidosContext";

/**
 * Las dos vistas de "Mis compras": las que están en curso (/pedidos) y
 * las que ya terminaron (/historial).
 */
export default function PestanasCompras({ actual }) {
  const navigate = useNavigate();
  const { enCurso } = usePedidos();

  const pestanas = [
    { clave: "enCurso", texto: "En curso", ruta: "/pedidos", numero: enCurso.length },
    { clave: "anteriores", texto: "Anteriores", ruta: "/historial" },
  ];

  return (
    <nav aria-label="Mis compras" className="flex gap-6 border-b border-gray-200 mb-6">
      {pestanas.map(({ clave, texto, ruta, numero }) => {
        const activa = clave === actual;
        return (
          <button
            key={clave}
            type="button"
            onClick={activa ? undefined : () => navigate(ruta)}
            aria-current={activa ? "page" : undefined}
            className={`-mb-px flex items-center gap-2 pb-3 text-sm font-bold border-b-2 transition ${
              activa ? "border-orange-500 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            {texto}
            {numero > 0 && (
              <span
                className={`text-xs font-black rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center ${
                  activa ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-700"
                }`}
              >
                {numero}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
