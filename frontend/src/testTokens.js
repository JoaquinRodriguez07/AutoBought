// Helper de tests: arma un JWT (sin firma real) que vence en `expMs`
// (milisegundos desde epoch). Solo sirve para que `decodeToken` lea `exp`.
export function crearToken(expMs) {
  const payload = btoa(
    JSON.stringify({ sub: "1", user_type: "client", exp: Math.floor(expMs / 1000) })
  );
  return `x.${payload}.y`;
}
