// Salir de la tienda a otra página (Mercado Pago). Está aparte para que los
// tests lo reemplacen: jsdom no navega a otras páginas.
export function irA(url) {
  window.location.assign(url);
}
