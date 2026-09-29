import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { obtenerSesion, sesionValida } from "../auth";
import {
  obtenerCarrito,
  agregarItemCarrito,
  actualizarItemCarrito,
  eliminarItemCarrito,
  vaciarCarritoAPI,
} from "../api";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);

  // Reemplaza el estado local con lo que devuelve la API (todas las
  // mutaciones del carrito devuelven el carrito COMPLETO ya
  // actualizado, así este es el único lugar que toca `cart`/`total`).
  const aplicarRespuesta = (carrito) => {
    setCart(carrito.items);
    setTotal(carrito.total);
    return carrito;
  };

  // Carga el carrito desde la API. Se llama al montar (por si ya hay
  // sesión activa, ej. refresh de página) y cuando App.jsx avisa que
  // el usuario inició sesión.
  const cargarCarrito = useCallback(async () => {
    if (!sesionValida(obtenerSesion())) {
      setCart([]);
      setTotal(0);
      return;
    }

    try {
      const carrito = await obtenerCarrito();
      aplicarRespuesta(carrito);
    } catch (error) {
      if (error.status !== 401) {
        toast.error(error.message || "No pudimos cargar tu carrito.");
      }
    }
  }, []);

  useEffect(() => {
    cargarCarrito();
    // Solo al montar: App.jsx llama a `cargarCarrito`/`limpiarCarrito`
    // explícitamente en los momentos en que la sesión cambia (login,
    // registro, logout).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vacía el estado local sin llamar a la API (para cerrar sesión: el
  // carrito del cliente sigue en la base, solo se limpia la pantalla).
  const limpiarCarritoLocal = useCallback(() => {
    setCart([]);
    setTotal(0);
  }, []);

  // Traduce los errores de la API a la reacción que le corresponde en
  // la UI: 401 → la sesión venció, se limpia el carrito y se manda a
  // login; el resto de los códigos (404/409/422/...) solo se avisan
  // con un toast, el mensaje ya viene en español desde el backend.
  const manejarError = (error) => {
    if (error.status === 401) {
      limpiarCarritoLocal();
      toast.error("Tu sesión venció. Iniciá sesión de nuevo.");
      navigate("/login");
      return;
    }

    toast.error(error.message || "No pudimos actualizar el carrito.");
  };

  const addToCart = async (producto, cantidad = 1) => {
    if (!sesionValida(obtenerSesion())) {
      toast.error("Iniciá sesión para agregar productos al carrito.");
      navigate("/login");
      return;
    }

    if (!producto || producto.stock === 0) return;

    const cantidadPedida = Math.max(1, Number(cantidad) || 1);
    const partId = producto.partId ?? producto.id;

    try {
      const carrito = await agregarItemCarrito(partId, cantidadPedida);
      aplicarRespuesta(carrito);
    } catch (error) {
      manejarError(error);
    }
  };

  const updateQuantity = async (productoId, nuevaCantidad) => {
    if (nuevaCantidad < 1) return;

    const item = cart.find((it) => it.id === String(productoId));
    const partId = item?.partId ?? productoId;

    try {
      const carrito = await actualizarItemCarrito(partId, nuevaCantidad);
      aplicarRespuesta(carrito);
    } catch (error) {
      manejarError(error);
    }
  };

  const removeFromCart = async (productoId) => {
    const item = cart.find((it) => it.id === String(productoId));
    const partId = item?.partId ?? productoId;

    try {
      const carrito = await eliminarItemCarrito(partId);
      aplicarRespuesta(carrito);
    } catch (error) {
      manejarError(error);
    }
  };

  const clearCart = async () => {
    try {
      const carrito = await vaciarCarritoAPI();
      aplicarRespuesta(carrito);
    } catch (error) {
      manejarError(error);
    }
  };

  const cantidadCarrito = cart.reduce((total, item) => total + item.cantidad, 0);

  const value = {
    cart,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    cantidadCarrito,
    total,

    // Usados por App.jsx en los momentos en que cambia la sesión
    // (login/registro/logout); no forman parte de la interfaz que
    // consumen las pantallas del carrito.
    cargarCarrito,
    limpiarCarritoLocal,
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
