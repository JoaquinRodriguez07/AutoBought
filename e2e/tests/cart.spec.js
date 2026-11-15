// Recorridos E2E del carrito: el aviso al agregar, deshacer e ir al carrito.

import { test, expect } from "@playwright/test";
import { ANA, addedNotice, logIn } from "../helpers.js";

test.describe("Carrito", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page, ANA);
  });

  test("agregar muestra un aviso con deshacer, y el aviso se va solo", async ({ page }) => {
    await page.goto("/catalogo");
    // El botón queda en "Agregado" un momento después del clic: buscar
    // "el primer Agregar" de la página daría otra tarjeta. Se fija la
    // tarjeta.
    const card = page.locator("article").first();
    const partName = await card.locator("h3").innerText();
    const addButton = card.getByRole("button", { name: "Agregar", exact: true });

    await addButton.click();
    await expect(addedNotice(page)).toBeVisible();
    await addedNotice(page).getByRole("button", { name: "Deshacer" }).click();
    await expect(addedNotice(page)).toHaveCount(0);

    // Sin tocar nada, se cierra a los pocos segundos (son 5).
    await addButton.click();
    await expect(addedNotice(page)).toBeVisible();
    await expect(addedNotice(page)).toHaveCount(0, { timeout: 8_000 });

    // Lo agregado queda en el carrito; se saca para dejarlo como estaba.
    await page.goto("/carrito");
    const removeButton = page.getByRole("button", { name: `Quitar ${partName} del carrito` });
    await expect(removeButton).toBeVisible();
    await removeButton.click();
    await expect(removeButton).toHaveCount(0);
  });

  test("ver carrito desde el aviso lleva al carrito con el repuesto", async ({ page }) => {
    await page.goto("/catalogo");
    const partName = await page.locator("article h3").first().innerText();
    await page.getByRole("button", { name: "Agregar", exact: true }).first().click();

    await addedNotice(page).getByRole("button", { name: "Ver carrito" }).click();

    await expect(page).toHaveURL(/\/carrito$/);
    const removeButton = page.getByRole("button", { name: `Quitar ${partName} del carrito` });
    await expect(removeButton).toBeVisible();
    await removeButton.click();
    await expect(removeButton).toHaveCount(0);
  });
});
