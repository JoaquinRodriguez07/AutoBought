// El carrito del cliente, compartido por toda la tienda.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import AddedToCartNotice from "../AddedToCartNotice";
import { isSeller, getSession, isSessionValid } from "../auth";
import {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCartApi,
} from "../api";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);
  const [aviso, setNotice] = useState(null);

  const closeNotice = useCallback(() => setNotice(null), []);

  // Si el cliente se va a otra pantalla (ej. tocó el carrito del
  // navbar) el aviso ya no tiene sentido: se cierra al cambiar la ruta.
  const { pathname } = useLocation();
  const [routeNotice, setRouteNotice] = useState(pathname);
  if (pathname !== routeNotice) {
    setRouteNotice(pathname);
    if (aviso) setNotice(null);
  }

  // Reemplaza el estado local con lo que devuelve la API (todas las
  // mutaciones del carrito devuelven el carrito COMPLETO ya
  // actualizado, así este es el único lugar que toca `cart`/`total`).
  const applyResponse = (cartState) => {
    setCart(cartState.items);
    setTotal(cartState.total);
    return cartState;
  };

  // Carga el carrito desde la API. Se llama al montar (por si ya hay
  // sesión activa, ej. refresh de página) y cuando App.jsx avisa que
  // el usuario inició sesión.
  const loadCart = useCallback(async () => {
    // Un vendedor no tiene carrito (la API le responde 403): no se pide.
    const session = getSession();
    if (!isSessionValid(session) || isSeller(session)) {
      setCart([]);
      setTotal(0);
      return;
    }

    try {
      const cartState = await getCart();
      applyResponse(cartState);
    } catch (error) {
      if (error.status !== 401) {
        toast.error(error.message || "No pudimos cargar tu carrito.");
      }
    }
  }, []);

  useEffect(() => {
    loadCart();
    // Solo al montar: App.jsx llama a `cargarCarrito`/`limpiarCarrito`
    // explícitamente en los momentos en que la sesión cambia (login,
    // registro, logout).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vacía el estado local sin llamar a la API (para cerrar sesión: el
  // carrito del cliente sigue en la base, solo se limpia la pantalla).
  const clearCartLocal = useCallback(() => {
    setCart([]);
    setTotal(0);
  }, []);

  // Traduce los errores de la API a la reacción que le corresponde en
  // la UI: 401 → no se hace nada acá, `alSesionInvalida` (api.js) lo maneja
  // en App.jsx (limpia el carrito, avisa y manda a login); el resto de los
  // códigos (404/409/422/...) solo se avisan con un toast, el mensaje ya
  // viene en español desde el backend.
  const handleError = (error) => {
    if (error.status === 401) return;

    toast.error(error.message || "No pudimos actualizar el carrito.");
  };

  // El 409 del backend dice "No hay stock suficiente. Disponible: N"
  // contando el stock total, pero lo que choca casi siempre son las
  // unidades que el cliente YA tenía en el carrito. Acá se arma un
  // mensaje que lo explique con los datos que ya tenemos.
  const messageWithoutStock = (product) => {
    const item = cart.find((it) => it.id === String(product.id));
    const disponible = item?.stock ?? product.stock;
    const inCart = item?.quantity ?? 0;
    const units = (n) => (n === 1 ? "1 unidad" : `${n} unidades`);

    if (disponible == null) return null;
    if (inCart >= disponible) {
      return `Ya tenés en el carrito las ${units(disponible)} disponibles.`;
    }
    const remains = disponible === 1 ? "Solo queda" : "Solo quedan";
    return inCart > 0
      ? `${remains} ${units(disponible)} y ya tenés ${inCart} en el carrito.`
      : `${remains} ${units(disponible)}.`;
  };

  // `aviso: false` es para quien ya está en el carrito (las
  // sugerencias): ahí el ítem aparece en la lista y no hace falta
  // avisar nada.
  const addToCart = async (product, quantity = 1, { aviso: showNotice = true } = {}) => {
    if (!isSessionValid(getSession())) {
      setNotice({ tipo: "login" });
      return false;
    }

    if (isSeller(getSession())) {
      toast.error("Los vendedores no pueden comprar.");
      return false;
    }

    if (!product || product.stock === 0) return false;

    const requestedQuantity = Math.max(1, Number(quantity) || 1);
    const partId = product.partId ?? product.id;

    try {
      const cartState = await addCartItem(partId, requestedQuantity);
      applyResponse(cartState);
      if (showNotice) {
        // Un solo aviso a la vez: si se vuelve a agregar el mismo
        // repuesto se suma al que está abierto ("×3") en vez de apilar.
        setNotice((current) =>
          current?.tipo === "added" && current.product.id === product.id
            ? { ...current, addedQuantity: current.addedQuantity + requestedQuantity }
            : { tipo: "added", product, addedQuantity: requestedQuantity }
        );
      }
      return true;
    } catch (error) {
      if (error.status === 409) {
        toast.error(messageWithoutStock(product) || error.message);
      } else {
        handleError(error);
      }
      return false;
    }
  };

  const updateQuantity = async (idProduct, newQuantity) => {
    if (newQuantity < 1) return;

    const item = cart.find((it) => it.id === String(idProduct));
    const partId = item?.partId ?? idProduct;

    try {
      const cartState = await updateCartItem(partId, newQuantity);
      applyResponse(cartState);
    } catch (error) {
      handleError(error);
    }
  };

  const removeFromCart = async (idProduct) => {
    const item = cart.find((it) => it.id === String(idProduct));
    const partId = item?.partId ?? idProduct;

    try {
      const cartState = await removeCartItem(partId);
      applyResponse(cartState);
    } catch (error) {
      handleError(error);
    }
  };

  // Deshace un "agregar al carrito": descuenta solo la cantidad que se
  // acaba de agregar. Si no quedan unidades previas, elimina la línea.
  const undoAdded = async (idProduct, addedQuantity) => {
    const item = cart.find((it) => it.id === String(idProduct));
    if (item && item.quantity > addedQuantity) {
      await updateQuantity(idProduct, item.quantity - addedQuantity);
    } else {
      await removeFromCart(idProduct);
    }
  };

  const clearCart = async () => {
    try {
      const cartState = await clearCartApi();
      applyResponse(cartState);
    } catch (error) {
      handleError(error);
    }
  };

  const cartQuantity = cart.reduce((total, item) => total + item.quantity, 0);

  const value = {
    cart,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    cartQuantity,
    total,

    // Usados por App.jsx en los momentos en que cambia la sesión
    // (login/registro/logout); no forman parte de la interfaz que
    // consumen las pantallas del carrito.
    loadCart,
    clearCartLocal,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
      <AddedToCartNotice
        aviso={aviso}
        cartQuantity={cartQuantity}
        total={total}
        onClose={closeNotice}
        onUndo={async () => {
          const { product, addedQuantity } = aviso;
          closeNotice();
          await undoAdded(product.id, addedQuantity);
        }}
        onSeeCart={() => {
          closeNotice();
          navigate("/carrito");
        }}
        onStartSession={() => {
          closeNotice();
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
