import { test, expect } from "@playwright/test";
import { ANA, avisoAgregado, iniciarSesion } from "../helpers.js";

test.describe("Carrito", () => {
  test.beforeEach(async ({ page }) => {
    await iniciarSesion(page, ANA);
  });

  test("agregar muestra un aviso con deshacer, y el aviso se va solo", async ({ page }) => {
    await page.goto("/catalogo");
    const agregar = page.getByRole("button", { name: "Agregar", exact: true }).first();

    await agregar.click();
    await expect(avisoAgregado(page)).toBeVisible();
    await avisoAgregado(page).getByRole("button", { name: "Deshacer" }).click();
    await expect(avisoAgregado(page)).toHaveCount(0);

    // Sin tocar nada, se cierra a los pocos segundos (son 5).
    await agregar.click();
    await expect(avisoAgregado(page)).toBeVisible();
    await expect(avisoAgregado(page)).toHaveCount(0, { timeout: 8_000 });

    // Lo agregado queda en el carrito; se saca para dejarlo como estaba.
    const nombre = await page.locator("article h3").first().innerText();
    await page.goto("/carrito");
    const quitar = page.getByRole("button", { name: `Quitar ${nombre} del carrito` });
    await expect(quitar).toBeVisible();
    await quitar.click();
    await expect(quitar).toHaveCount(0);
  });

  test("ver carrito desde el aviso lleva al carrito con el repuesto", async ({ page }) => {
    await page.goto("/catalogo");
    const nombre = await page.locator("article h3").first().innerText();
    await page.getByRole("button", { name: "Agregar", exact: true }).first().click();

    await avisoAgregado(page).getByRole("button", { name: "Ver carrito" }).click();

    await expect(page).toHaveURL(/\/carrito$/);
    const quitar = page.getByRole("button", { name: `Quitar ${nombre} del carrito` });
    await expect(quitar).toBeVisible();
    await quitar.click();
    await expect(quitar).toHaveCount(0);
  });
});
