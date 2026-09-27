import { createContext, useContext, useEffect, useState } from "react";
import toast from "react-hot-toast";

const CartContext = createContext(null);
const STORAGE_KEY = "autobought-carrito";

function leerCarritoGuardado() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState(leerCarritoGuardado);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  const addToCart = (producto, cantidad = 1) => {
    if (!producto || producto.stock === 0) return;

    const cantidadPedida = Math.max(1, Number(cantidad) || 1);

    setCart((actual) => {
      const existente = actual.find((item) => item.id === producto.id);
      const cantidadPrevia = existente ? existente.cantidad : 0;
      const cantidadFinal = Math.min(producto.stock, cantidadPrevia + cantidadPedida);

      if (cantidadFinal < cantidadPrevia + cantidadPedida) {
        toast.error(`Solo hay ${producto.stock} unidades disponibles de "${producto.nombre}".`);
      }

      if (cantidadFinal === cantidadPrevia) return actual;

      const itemActualizado = {
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        imagen: producto.imagen,
        cantidad: cantidadFinal,
        stock: producto.stock,
      };

      if (existente) {
        return actual.map((item) => (item.id === producto.id ? itemActualizado : item));
      }
      return [...actual, itemActualizado];
    });
  };

  const updateQuantity = (productoId, nuevaCantidad) => {
    setCart((actual) => {
      const item = actual.find((it) => it.id === productoId);
      if (!item) return actual;

      if (nuevaCantidad > item.stock) {
        toast.error(`Solo hay ${item.stock} unidades disponibles de "${item.nombre}".`);
        return actual;
      }
      if (nuevaCantidad < 1) return actual;

      return actual.map((it) =>
        it.id === productoId ? { ...it, cantidad: nuevaCantidad } : it
      );
    });
  };

  const removeFromCart = (productoId) => {
    setCart((actual) => actual.filter((item) => item.id !== productoId));
  };

  const clearCart = () => setCart([]);

  const cantidadCarrito = cart.reduce((total, item) => total + item.cantidad, 0);
  const total = cart.reduce((acc, item) => acc + item.precio * item.cantidad, 0);

  const value = {
    cart,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    cantidadCarrito,
    total,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart debe usarse dentro de un CartProvider");
  }
  return context;
}
