import { defineConfig, devices } from "@playwright/test";

// Recorridos de punta a punta: abren la app en un Chrome de verdad, contra
// la app levantada con docker compose (frontend en :5173, Mailpit en :8025).
// En CI corren en .github/workflows/e2e.yml; en local, ver el README.
const enCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Un reintento en CI: una falla por lentitud no abre un issue; una
  // falla real falla las dos veces.
  retries: enCI ? 1 : 0,
  // Los recorridos comparten los usuarios de prueba (por ejemplo, el
  // carrito de Ana): de a uno, para que no se pisen.
  workers: 1,
  forbidOnly: enCI,
  // En CI, además: el reporte HTML (va en el artefacto) y un JSON del que
  // el workflow saca qué recorridos fallaron para el issue.
  reporter: enCI
    ? [["list"], ["html", { open: "never" }], ["json", { outputFile: "resultados.json" }]]
    : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    locale: "es-UY",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
