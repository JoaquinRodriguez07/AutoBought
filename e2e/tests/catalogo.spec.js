import { test, expect } from "@playwright/test";
import { clicEnCinta } from "../helpers.js";

test.describe("Catálogo", () => {
  test("una categoría del inicio abre el catálogo filtrado por esa categoría", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Frenos/ }).first().click();

    await expect(page).toHaveURL(/\/catalogo$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/frenos/i);
    await expect(page.getByText(/\d+ resultados?/)).toBeVisible();
  });

  test("una marca del inicio filtra una sola vez y no se arrastra a la próxima visita", async ({ page }) => {
    await page.goto("/");
    await clicEnCinta(page.getByRole("button", { name: "Ver repuestos de Ford" }));

    await expect(page).toHaveURL(/marca=Ford/);
    await expect(page.getByRole("checkbox", { name: /Ford/ })).toBeChecked();

    await page.goto("/");
    await page.getByRole("button", { name: /^Frenos/ }).first().click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/frenos/i);
    await expect(page.getByRole("button", { name: "Quitar filtro Para Ford" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Borrar filtros" })).toHaveCount(0);
  });

  test("un fabricante del inicio abre el catálogo con ese fabricante tildado", async ({ page }) => {
    await page.goto("/");
    await clicEnCinta(page.getByRole("button", { name: "Brembo", exact: true }));

    await expect(page).toHaveURL(/fabricante=Brembo/);
    await expect(page.getByRole("checkbox", { name: /Brembo/ })).toBeChecked();
  });

  test("la búsqueda con Enter consulta al servidor y muestra resultados", async ({ page }) => {
    await page.goto("/catalogo");
    const barra = page.getByPlaceholder(/buscar repuesto/i);
    await barra.fill("pastillas de freno");
    await barra.press("Enter");

    await expect(page).toHaveURL(/q=pastillas/);
    await expect(page.locator("article h3").first()).toContainText(/pastilla/i);
  });
});
