import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import ConfirmacionAgregarCarrito from "../ConfirmacionAgregarCarrito";
import { esVendedor, obtenerSesion, sesionValida } from "../auth";
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
  const [aviso, setAviso] = useState(null);

  const cerrarAviso = useCallback(() => setAviso(null), []);

  // Si el cliente se va a otra pantalla (ej. tocó el carrito del
  // navbar) el aviso ya no tiene sentido: se cierra al cambiar la ruta.
  const { pathname } = useLocation();
  const [rutaDelAviso, setRutaDelAviso] = useState(pathname);
  if (pathname !== rutaDelAviso) {
    setRutaDelAviso(pathname);
    if (aviso) setAviso(null);
  }

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
    // Un vendedor no tiene carrito (la API le responde 403): no se pide.
    const sesion = obtenerSesion();
    if (!sesionValida(sesion) || esVendedor(sesion)) {
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

  // El 409 del backend dice "No hay stock suficiente. Disponible: N"
  // contando el stock total, pero lo que choca casi siempre son las
  // unidades que el cliente YA tenía en el carrito. Acá se arma un
  // mensaje que lo explique con los datos que ya tenemos.
  const mensajeSinStock = (producto) => {
    const item = cart.find((it) => it.id === String(producto.id));
    const disponible = item?.stock ?? producto.stock;
    const enCarrito = item?.cantidad ?? 0;
    const unidades = (n) => (n === 1 ? "1 unidad" : `${n} unidades`);

    if (disponible == null) return null;
    if (enCarrito >= disponible) {
      return `Ya tenés en el carrito las ${unidades(disponible)} disponibles.`;
    }
    const queda = disponible === 1 ? "Solo queda" : "Solo quedan";
    return enCarrito > 0
      ? `${queda} ${unidades(disponible)} y ya tenés ${enCarrito} en el carrito.`
      : `${queda} ${unidades(disponible)}.`;
  };

  // `aviso: false` es para quien ya está en el carrito (las
  // sugerencias): ahí el ítem aparece en la lista y no hace falta
  // avisar nada.
  const addToCart = async (producto, cantidad = 1, { aviso: mostrarAviso = true } = {}) => {
    if (!sesionValida(obtenerSesion())) {
      setAviso({ tipo: "login" });
      return false;
    }

    if (esVendedor(obtenerSesion())) {
      toast.error("Los vendedores no pueden comprar.");
      return false;
    }

    if (!producto || producto.stock === 0) return false;

    const cantidadPedida = Math.max(1, Number(cantidad) || 1);
    const partId = producto.partId ?? producto.id;

    try {
      const carrito = await agregarItemCarrito(partId, cantidadPedida);
      aplicarRespuesta(carrito);
      if (mostrarAviso) {
        // Un solo aviso a la vez: si se vuelve a agregar el mismo
        // repuesto se suma al que está abierto ("×3") en vez de apilar.
        setAviso((actual) =>
          actual?.tipo === "agregado" && actual.producto.id === producto.id
            ? { ...actual, cantidadAgregada: actual.cantidadAgregada + cantidadPedida }
            : { tipo: "agregado", producto, cantidadAgregada: cantidadPedida }
        );
      }
      return true;
    } catch (error) {
      if (error.status === 409) {
        toast.error(mensajeSinStock(producto) || error.message);
      } else {
        manejarError(error);
      }
      return false;
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

  // Deshace un "agregar al carrito": descuenta solo la cantidad que se
  // acaba de agregar. Si no quedan unidades previas, elimina la línea.
  const deshacerAgregado = async (productoId, cantidadAgregada) => {
    const item = cart.find((it) => it.id === String(productoId));
    if (item && item.cantidad > cantidadAgregada) {
      await updateQuantity(productoId, item.cantidad - cantidadAgregada);
    } else {
      await removeFromCart(productoId);
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

  return (
    <CartContext.Provider value={value}>
      {children}
      <ConfirmacionAgregarCarrito
        aviso={aviso}
        cantidadCarrito={cantidadCarrito}
        total={total}
        onCerrar={cerrarAviso}
        onDeshacer={async () => {
          const { producto, cantidadAgregada } = aviso;
          cerrarAviso();
          await deshacerAgregado(producto.id, cantidadAgregada);
        }}
        onVerCarrito={() => {
          cerrarAviso();
          navigate("/carrito");
        }}
        onIniciarSesion={() => {
          cerrarAviso();
          navigate("/login");
        }}
      />
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart debe usarse dentro de un CartProvider");
  }
  return context;
}
