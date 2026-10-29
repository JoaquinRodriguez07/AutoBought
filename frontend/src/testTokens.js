// Helper de tests: arma un JWT (sin firma real) que vence en `expMs`
// (milisegundos desde epoch). Solo sirve para que `decodeToken` lea `exp`
// y `user_type` ("client" por defecto, "employee" para un vendedor).
export function crearToken(expMs, userType = "client") {
  const payload = btoa(
    JSON.stringify({ sub: "1", user_type: userType, exp: Math.floor(expMs / 1000) })
  );
  return `x.${payload}.y`;
}
