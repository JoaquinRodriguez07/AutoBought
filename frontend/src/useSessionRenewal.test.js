// Tests de la renovación automática de la sesión.

import { act, renderHook } from "@testing-library/react";

jest.mock("./api", () => ({ renewToken: jest.fn() }));

import { renewToken } from "./api";
import { RENEWAL_MARGIN_MS } from "./auth";
import { createToken } from "./testTokens";
import { RENEWAL_RETRY_MS, useSessionRenewal } from "./useSessionRenewal";

const MIN = 60 * 1000;
const NOW = new Date("2030-01-01T10:00:00Z").getTime();

// Token que vence `minutos` después de "ahora" (el reloj falso).
const tokenThatExpires = (minutes) => createToken(Date.now() + minutes * MIN);
const response = (minutes) => ({ access_token: tokenThatExpires(minutes), token_type: "bearer" });

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
  const onRenewed = jest.fn();
  const onExpired = jest.fn();
  const hook = renderHook(
    ({ tk }) => useSessionRenewal(tk, { onRenewed, onExpired }),
    { initialProps: { tk: token } }
  );
  return { ...hook, onRenewed, onExpired };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  renewToken.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useSessionRenewal", () => {
  it("pide el token nuevo MARGEN_RENOVACION_MS antes de que venza el actual, y no antes", async () => {
    renewToken.mockResolvedValue(response(60));
    const { onRenewed } = montar(tokenThatExpires(60));

    await avanzar(60 * MIN - RENEWAL_MARGIN_MS - 1000);
    expect(renewToken).not.toHaveBeenCalled();

    await avanzar(1000);
    expect(renewToken).toHaveBeenCalledTimes(1);
    expect(onRenewed).toHaveBeenCalledWith(expect.objectContaining({ token_type: "bearer" }));
  });

  // Escenario: Renovación automática
  //   Dado que inicié sesión hace 55 minutos
  //   Cuando sigo usando la tienda
  //   Entonces no pierdo la sesión al pasar los 60 minutos
  it("la sesión iniciada hace 55 minutos sigue viva pasados los 60", async () => {
    // A los 55 minutos al token le quedan 5.
    const initial = tokenThatExpires(5);
    renewToken.mockResolvedValue(response(60));
    const onExpired = jest.fn();
    let currentToken = initial;
    const hook = renderHook(
      ({ tk }) =>
        useSessionRenewal(tk, {
          onRenewed: (data) => {
            currentToken = data.access_token;
            hook.rerender({ tk: data.access_token });
          },
          onExpired,
        }),
      { initialProps: { tk: initial } }
    );

    // Se renueva enseguida: ya estamos dentro del margen.
    await avanzar(0);
    expect(renewToken).toHaveBeenCalledTimes(1);
    expect(currentToken).not.toBe(initial);

    // Pasan los 5 minutos que le quedaban al token viejo y unos más.
    await avanzar(10 * MIN);

    expect(onExpired).not.toHaveBeenCalled();
    // Y la sesión se mantiene: el token nuevo todavía no está en su margen.
    expect(renewToken).toHaveBeenCalledTimes(1);
  });

  it("encadena renovaciones: un cliente que no se va nunca pierde la sesión", async () => {
    renewToken.mockImplementation(async () => response(60));
    const onExpired = jest.fn();
    const hook = renderHook(
      ({ tk }) =>
        useSessionRenewal(tk, {
          onRenewed: (data) => hook.rerender({ tk: data.access_token }),
          onExpired,
        }),
      { initialProps: { tk: tokenThatExpires(60) } }
    );

    // Tres horas de uso, en tramos de 56 minutos.
    for (let i = 0; i < 3; i++) {
      await avanzar(56 * MIN);
    }

    // Una por cada ~55 minutos de uso.
    expect(renewToken).toHaveBeenCalledTimes(3);
    expect(onExpired).not.toHaveBeenCalled();
  });

  // Escenario: Token vencido
  it("avisa que la sesión venció si la API responde 401, y no reintenta", async () => {
    renewToken.mockRejectedValue(error401());
    const { onExpired, onRenewed } = montar(tokenThatExpires(60));

    await avanzar(60 * MIN);

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(onRenewed).not.toHaveBeenCalled();
    expect(renewToken).toHaveBeenCalledTimes(1);
  });

  it("ante un error pasajero reintenta mientras el token siga vivo", async () => {
    renewToken
      .mockRejectedValueOnce(error503())
      .mockRejectedValueOnce(new Error("No pudimos conectar con el servidor."))
      .mockResolvedValueOnce(response(60));
    const { onRenewed, onExpired } = montar(tokenThatExpires(60));

    await avanzar(60 * MIN - RENEWAL_MARGIN_MS);
    expect(renewToken).toHaveBeenCalledTimes(1);

    await avanzar(RENEWAL_RETRY_MS - 1);
    expect(renewToken).toHaveBeenCalledTimes(1);

    await avanzar(1);
    expect(renewToken).toHaveBeenCalledTimes(2);

    await avanzar(RENEWAL_RETRY_MS);
    expect(renewToken).toHaveBeenCalledTimes(3);
    expect(onRenewed).toHaveBeenCalledTimes(1);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("si los reintentos llegan hasta que el token vence, termina en onVencida", async () => {
    renewToken
      .mockRejectedValueOnce(error503())
      .mockRejectedValueOnce(error503())
      .mockRejectedValue(error401());
    const { onExpired } = montar(tokenThatExpires(60));

    await avanzar(60 * MIN + 2 * MIN);

    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("no hace nada sin token (nadie con la sesión iniciada) ni con un token sin exp", async () => {
    montar(null);
    montar("no-es-un-jwt");

    await avanzar(120 * MIN);

    expect(renewToken).not.toHaveBeenCalled();
  });

  it("al cerrar la sesión (token null) o desmontar cancela la renovación pendiente", async () => {
    const a = montar(tokenThatExpires(60));
    a.rerender({ tk: null });
    const b = montar(tokenThatExpires(60));
    b.unmount();

    await avanzar(120 * MIN);

    expect(renewToken).not.toHaveBeenCalled();
  });

  it("ignora la respuesta si la sesión cambió mientras el pedido estaba en vuelo", async () => {
    let responder;
    renewToken.mockReturnValue(new Promise((resolve) => { responder = resolve; }));
    const { onRenewed, unmount } = montar(tokenThatExpires(60));

    await avanzar(60 * MIN - RENEWAL_MARGIN_MS);
    expect(renewToken).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => { responder(response(60)); });

    expect(onRenewed).not.toHaveBeenCalled();
  });

  it("no manda un segundo pedido si el primero todavía no terminó", async () => {
    renewToken.mockReturnValue(new Promise(() => {}));
    montar(tokenThatExpires(60));

    await avanzar(60 * MIN - RENEWAL_MARGIN_MS);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await avanzar(1000);

    expect(renewToken).toHaveBeenCalledTimes(1);
  });

  it("al volver a la pestaña después de que el temporizador se frenó, renueva enseguida", async () => {
    renewToken.mockResolvedValue(response(60));
    const { onRenewed } = montar(tokenThatExpires(60));

    // La compu se suspende: el reloj avanza 58 minutos pero no corre ningún temporizador.
    jest.setSystemTime(NOW + 58 * MIN);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(renewToken).toHaveBeenCalledTimes(1);
    expect(onRenewed).toHaveBeenCalledTimes(1);
  });

  it("al volver a la pestaña antes de la hora solo reajusta el temporizador", async () => {
    renewToken.mockResolvedValue(response(60));
    montar(tokenThatExpires(60));

    jest.setSystemTime(NOW + 20 * MIN);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(renewToken).not.toHaveBeenCalled();

    // La hora de renovar sigue siendo el minuto 55 del token, no el 75.
    await avanzar(35 * MIN - 1000);
    expect(renewToken).not.toHaveBeenCalled();
    await avanzar(1000);
    expect(renewToken).toHaveBeenCalledTimes(1);
  });

  it("con un token que vence en 2100 no desborda el setTimeout ni renueva de golpe", async () => {
    montar(createToken(4102444800 * 1000));

    await avanzar(30 * 24 * 60 * MIN);

    expect(renewToken).not.toHaveBeenCalled();
  });

  it("si el backend emitiera tokens más cortos que el margen, no entra en un bucle de pedidos", async () => {
    renewToken.mockImplementation(async () => response(2));
    const hook = renderHook(
      ({ tk }) =>
        useSessionRenewal(tk, {
          onRenewed: (data) => hook.rerender({ tk: data.access_token }),
          onExpired: jest.fn(),
        }),
      { initialProps: { tk: tokenThatExpires(2) } }
    );

    await avanzar(60 * 1000);

    // Piso de 5 s entre pedidos: como mucho ~12 en un minuto, no miles.
    expect(renewToken.mock.calls.length).toBeLessThanOrEqual(13);
  });
});
