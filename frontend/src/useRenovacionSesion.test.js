import { act, renderHook } from "@testing-library/react";

jest.mock("./api", () => ({ renovarToken: jest.fn() }));

import { renovarToken } from "./api";
import { MARGEN_RENOVACION_MS } from "./auth";
import { crearToken } from "./testTokens";
import { REINTENTO_RENOVACION_MS, useRenovacionSesion } from "./useRenovacionSesion";

const MIN = 60 * 1000;
const AHORA = new Date("2030-01-01T10:00:00Z").getTime();

// Token que vence `minutos` después de "ahora" (el reloj falso).
const tokenQueVence = (minutos) => crearToken(Date.now() + minutos * MIN);
const respuesta = (minutos) => ({ access_token: tokenQueVence(minutos), token_type: "bearer" });

function error401() {
  const e = new Error("Tu sesión venció. Iniciá sesión de nuevo.");
  e.status = 401;
  return e;
}

function error503() {
  const e = new Error("No pudimos renovar tu sesión.");
  e.status = 503;
  return e;
}

// Avanza el reloj y deja correr las promesas pendientes.
async function avanzar(ms) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

function montar(token) {
  const onRenovada = jest.fn();
  const onVencida = jest.fn();
  const hook = renderHook(
    ({ tk }) => useRenovacionSesion(tk, { onRenovada, onVencida }),
    { initialProps: { tk: token } }
  );
  return { ...hook, onRenovada, onVencida };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(AHORA);
  renovarToken.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useRenovacionSesion", () => {
  it("pide el token nuevo MARGEN_RENOVACION_MS antes de que venza el actual, y no antes", async () => {
    renovarToken.mockResolvedValue(respuesta(60));
    const { onRenovada } = montar(tokenQueVence(60));

    await avanzar(60 * MIN - MARGEN_RENOVACION_MS - 1000);
    expect(renovarToken).not.toHaveBeenCalled();

    await avanzar(1000);
    expect(renovarToken).toHaveBeenCalledTimes(1);
    expect(onRenovada).toHaveBeenCalledWith(expect.objectContaining({ token_type: "bearer" }));
  });

  // Escenario: Renovación automática
  //   Dado que inicié sesión hace 55 minutos
  //   Cuando sigo usando la tienda
  //   Entonces no pierdo la sesión al pasar los 60 minutos
  it("la sesión iniciada hace 55 minutos sigue viva pasados los 60", async () => {
    // A los 55 minutos al token le quedan 5.
    const inicial = tokenQueVence(5);
    renovarToken.mockResolvedValue(respuesta(60));
    const onVencida = jest.fn();
    let tokenActual = inicial;
    const hook = renderHook(
      ({ tk }) =>
        useRenovacionSesion(tk, {
          onRenovada: (data) => {
            tokenActual = data.access_token;
            hook.rerender({ tk: data.access_token });
          },
          onVencida,
        }),
      { initialProps: { tk: inicial } }
    );

    // Se renueva enseguida: ya estamos dentro del margen.
    await avanzar(0);
    expect(renovarToken).toHaveBeenCalledTimes(1);
    expect(tokenActual).not.toBe(inicial);

    // Pasan los 5 minutos que le quedaban al token viejo y unos más.
    await avanzar(10 * MIN);

    expect(onVencida).not.toHaveBeenCalled();
    // Y la sesión se mantiene: el token nuevo todavía no está en su margen.
    expect(renovarToken).toHaveBeenCalledTimes(1);
  });

  it("encadena renovaciones: un cliente que no se va nunca pierde la sesión", async () => {
    renovarToken.mockImplementation(async () => respuesta(60));
    const onVencida = jest.fn();
    const hook = renderHook(
      ({ tk }) =>
        useRenovacionSesion(tk, {
          onRenovada: (data) => hook.rerender({ tk: data.access_token }),
          onVencida,
        }),
      { initialProps: { tk: tokenQueVence(60) } }
    );

    // Tres horas de uso, en tramos de 56 minutos.
    for (let i = 0; i < 3; i++) {
      await avanzar(56 * MIN);
    }

    // Una por cada ~55 minutos de uso.
    expect(renovarToken).toHaveBeenCalledTimes(3);
    expect(onVencida).not.toHaveBeenCalled();
  });

  // Escenario: Token vencido
  it("avisa que la sesión venció si la API responde 401, y no reintenta", async () => {
    renovarToken.mockRejectedValue(error401());
    const { onVencida, onRenovada } = montar(tokenQueVence(60));

    await avanzar(60 * MIN);

    expect(onVencida).toHaveBeenCalledTimes(1);
    expect(onRenovada).not.toHaveBeenCalled();
    expect(renovarToken).toHaveBeenCalledTimes(1);
  });

  it("ante un error pasajero reintenta mientras el token siga vivo", async () => {
    renovarToken
      .mockRejectedValueOnce(error503())
      .mockRejectedValueOnce(new Error("No pudimos conectar con el servidor."))
      .mockResolvedValueOnce(respuesta(60));
    const { onRenovada, onVencida } = montar(tokenQueVence(60));

    await avanzar(60 * MIN - MARGEN_RENOVACION_MS);
    expect(renovarToken).toHaveBeenCalledTimes(1);

    await avanzar(REINTENTO_RENOVACION_MS - 1);
    expect(renovarToken).toHaveBeenCalledTimes(1);

    await avanzar(1);
    expect(renovarToken).toHaveBeenCalledTimes(2);

    await avanzar(REINTENTO_RENOVACION_MS);
    expect(renovarToken).toHaveBeenCalledTimes(3);
    expect(onRenovada).toHaveBeenCalledTimes(1);
    expect(onVencida).not.toHaveBeenCalled();
  });

  it("si los reintentos llegan hasta que el token vence, termina en onVencida", async () => {
    renovarToken
      .mockRejectedValueOnce(error503())
      .mockRejectedValueOnce(error503())
      .mockRejectedValue(error401());
    const { onVencida } = montar(tokenQueVence(60));

    await avanzar(60 * MIN + 2 * MIN);

    expect(onVencida).toHaveBeenCalledTimes(1);
  });

  it("no hace nada sin token (nadie con la sesión iniciada) ni con un token sin exp", async () => {
    montar(null);
    montar("no-es-un-jwt");

    await avanzar(120 * MIN);

    expect(renovarToken).not.toHaveBeenCalled();
  });

  it("al cerrar la sesión (token null) o desmontar cancela la renovación pendiente", async () => {
    const a = montar(tokenQueVence(60));
    a.rerender({ tk: null });
    const b = montar(tokenQueVence(60));
    b.unmount();

    await avanzar(120 * MIN);

    expect(renovarToken).not.toHaveBeenCalled();
  });

  it("ignora la respuesta si la sesión cambió mientras el pedido estaba en vuelo", async () => {
    let responder;
    renovarToken.mockReturnValue(new Promise((resolve) => { responder = resolve; }));
    const { onRenovada, unmount } = montar(tokenQueVence(60));

    await avanzar(60 * MIN - MARGEN_RENOVACION_MS);
    expect(renovarToken).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => { responder(respuesta(60)); });

    expect(onRenovada).not.toHaveBeenCalled();
  });

  it("no manda un segundo pedido si el primero todavía no terminó", async () => {
    renovarToken.mockReturnValue(new Promise(() => {}));
    montar(tokenQueVence(60));

    await avanzar(60 * MIN - MARGEN_RENOVACION_MS);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await avanzar(1000);

    expect(renovarToken).toHaveBeenCalledTimes(1);
  });

  it("al volver a la pestaña después de que el temporizador se frenó, renueva enseguida", async () => {
    renovarToken.mockResolvedValue(respuesta(60));
    const { onRenovada } = montar(tokenQueVence(60));

    // La compu se suspende: el reloj avanza 58 minutos pero no corre ningún temporizador.
    jest.setSystemTime(AHORA + 58 * MIN);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(renovarToken).toHaveBeenCalledTimes(1);
    expect(onRenovada).toHaveBeenCalledTimes(1);
  });

  it("al volver a la pestaña antes de la hora solo reajusta el temporizador", async () => {
    renovarToken.mockResolvedValue(respuesta(60));
    montar(tokenQueVence(60));

    jest.setSystemTime(AHORA + 20 * MIN);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(renovarToken).not.toHaveBeenCalled();

    // La hora de renovar sigue siendo el minuto 55 del token, no el 75.
    await avanzar(35 * MIN - 1000);
    expect(renovarToken).not.toHaveBeenCalled();
    await avanzar(1000);
    expect(renovarToken).toHaveBeenCalledTimes(1);
  });

  it("con un token que vence en 2100 no desborda el setTimeout ni renueva de golpe", async () => {
    montar(crearToken(4102444800 * 1000));

    await avanzar(30 * 24 * 60 * MIN);

    expect(renovarToken).not.toHaveBeenCalled();
  });

  it("si el backend emitiera tokens más cortos que el margen, no entra en un bucle de pedidos", async () => {
    renovarToken.mockImplementation(async () => respuesta(2));
    const hook = renderHook(
      ({ tk }) =>
        useRenovacionSesion(tk, {
          onRenovada: (data) => hook.rerender({ tk: data.access_token }),
          onVencida: jest.fn(),
        }),
      { initialProps: { tk: tokenQueVence(2) } }
    );

    await avanzar(60 * 1000);

    // Piso de 5 s entre pedidos: como mucho ~12 en un minuto, no miles.
    expect(renovarToken.mock.calls.length).toBeLessThanOrEqual(13);
  });
});
