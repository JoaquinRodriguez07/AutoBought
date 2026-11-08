// Tests de la actualización automática de los pedidos.

import { act, renderHook } from "@testing-library/react";

import { AUTO_REFRESH_MS, useAutoRefresh } from "./useAutoRefresh";

// Avanza el reloj y deja correr las promesas pendientes.
async function advance(ms) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

async function goBackToTab() {
  setVisibility("visible");
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  setVisibility("visible");
});

afterEach(() => {
  jest.useRealTimers();
  setVisibility("visible");
});

describe("useAutoRefresh", () => {
  test("refreshes every 15 seconds while the tab is visible", async () => {
    const refresh = jest.fn().mockResolvedValue();
    renderHook(() => useAutoRefresh(refresh));

    expect(refresh).not.toHaveBeenCalled();
    await advance(AUTO_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    await advance(AUTO_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(AUTO_REFRESH_MS).toBe(15000);
  });

  test("doesn't refresh with the tab hidden, and does as soon as the user comes back", async () => {
    const refresh = jest.fn().mockResolvedValue();
    renderHook(() => useAutoRefresh(refresh));

    setVisibility("hidden");
    await advance(AUTO_REFRESH_MS * 3);
    expect(refresh).not.toHaveBeenCalled();

    await goBackToTab();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("doesn't run while disabled", async () => {
    const refresh = jest.fn().mockResolvedValue();
    const { rerender } = renderHook(({ enabled }) => useAutoRefresh(refresh, { enabled }), {
      initialProps: { enabled: false },
    });

    await advance(AUTO_REFRESH_MS * 2);
    expect(refresh).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await advance(AUTO_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("doesn't start a new request while the previous one hasn't come back", async () => {
    let finish;
    const refresh = jest.fn(() => new Promise((resolve) => (finish = resolve)));
    renderHook(() => useAutoRefresh(refresh));

    await advance(AUTO_REFRESH_MS * 3);
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await advance(AUTO_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test("a failed refresh doesn't stop the next ones", async () => {
    const refresh = jest.fn().mockRejectedValueOnce(new Error("sin red")).mockResolvedValue();
    renderHook(() => useAutoRefresh(refresh));

    await advance(AUTO_REFRESH_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test("stops when unmounted", async () => {
    const refresh = jest.fn().mockResolvedValue();
    const { unmount } = renderHook(() => useAutoRefresh(refresh));

    unmount();
    await advance(AUTO_REFRESH_MS * 2);
    await goBackToTab();
    expect(refresh).not.toHaveBeenCalled();
  });
});
