// Único punto donde los datos completos de la tarjeta salen del formulario.
//
// En una app real, acá se llama al SDK de la pasarela de pagos (Mercado
// Pago, dLocal, etc.): el SDK manda número, vencimiento y CVV directo a
// los servidores de la pasarela, que valida la tarjeta con el banco y
// devuelve un token. El CVV se usa solo para esa validación y se descarta;
// ni el número completo ni el CVV llegan nunca a nuestro backend.
//
// Mientras no haya pasarela, esto simula esa respuesta: devuelve lo único
// que el backend guarda (marca, últimos 4 dígitos y vencimiento).

import { soloDigitos } from "./validaciones";

export async function tokenizarTarjeta({ tipo, numero, vencimiento, cvv }) {
  void cvv; // Con pasarela: va en el pedido al SDK, nunca a nuestra API.

  return {
    marca: tipo,
    ultimosCuatro: soloDigitos(numero).slice(-4),
    vencimiento,
  };
}
