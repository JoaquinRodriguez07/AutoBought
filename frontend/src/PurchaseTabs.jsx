// Las pestañas de «Mis compras»: en curso y anteriores.

import { useNavigate } from "react-router-dom";

import { useOrders } from "./context/OrdersContext";

/**
 * Las dos vistas de "Mis compras": las que están en curso (/pedidos) y
 * las que ya terminaron (/historial).
 */
export default function PurchaseTabs({ current }) {
  const navigate = useNavigate();
  const { inProgress } = useOrders();

  const pestanas = [
    { key: "inProgress", texto: "En curso", route: "/pedidos", number: inProgress.length },
    { key: "anteriores", texto: "Anteriores", route: "/historial" },
  ];

  return (
    <nav aria-label="Mis compras" className="flex gap-6 border-b border-gray-200 mb-6">
      {pestanas.map(({ key, texto, route, number }) => {
        const active = key === current;
        return (
          <button
            key={key}
            type="button"
            onClick={active ? undefined : () => navigate(route)}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex items-center gap-2 pb-3 text-sm font-bold border-b-2 transition ${
              active ? "border-orange-500 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            {texto}
            {number > 0 && (
              <span
                className={`text-xs font-black rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center ${
                  active ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-700"
                }`}
              >
                {number}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
