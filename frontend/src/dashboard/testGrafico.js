// Helper de tests: jsdom no tiene layout, así que el contenedor del
// gráfico mide 0×0 y Recharts no dibuja nada. Simula un contenedor de
// 800×300 (ResizeObserver y getBoundingClientRect). Devuelve la función
// que deja todo como estaba.
export function simularTamanioDelGrafico(width = 800, height = 300) {
  const resizeObserverOriginal = global.ResizeObserver;
  const rectOriginal = HTMLElement.prototype.getBoundingClientRect;

  global.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
    }
    observe(elemento) {
      this.callback([{ target: elemento, contentRect: { width, height } }]);
    }
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.getBoundingClientRect = () => ({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON() {},
  });

  return () => {
    global.ResizeObserver = resizeObserverOriginal;
    HTMLElement.prototype.getBoundingClientRect = rectOriginal;
  };
}
