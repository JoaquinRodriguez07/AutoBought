// Recorrido E2E de favoritos: marcar, ver la lista y agregar al carrito desde ahí.

import { test, expect } from "@playwright/test";
import { ANA, addedNotice, logIn } from "../helpers.js";

test("favoritos: marcar uno, verlo en la lista y agregarlo al carrito desde ahí", async ({ page }) => {
  await logIn(page, ANA);
  await page.goto("/catalogo");

  // Se elige un repuesto que no sea favorito y después se lo sigue por el
  // nombre: al marcarlo, deja de cumplir el filtro con el que se eligió.
  const partName = await page
    .locator("article")
    .filter({ has: page.getByRole("button", { name: "Marcar como favorito" }) })
    .first()
    .locator("h3")
    .innerText();
  // El título de la tarjeta es un botón "Ver detalle de <nombre>": por él se
  // encuentra la tarjeta.
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("button", { name: `Ver detalle de ${partName}`, exact: true }) });
  await card.getByRole("button", { name: "Marcar como favorito" }).click();
  await expect(card.getByRole("button", { name: "Quitar de favoritos" })).toBeVisible();

  await page.getByTitle("Favoritos").click();
  await expect(page).toHaveURL(/\/favoritos$/);

  const inFavorites = page
    .getByRole("button", { name: partName, exact: true })
    .locator("xpath=ancestor::div[.//button[@aria-label='Quitar de favoritos']][1]");
  await expect(inFavorites).toBeVisible();

  await inFavorites.getByRole("button", { name: /agregar al carrito/i }).click();
  await expect(addedNotice(page)).toContainText(partName);
  await addedNotice(page).getByRole("button", { name: "Deshacer" }).click();
  await expect(addedNotice(page)).toHaveCount(0);

  // Se deja como estaba: se saca de favoritos.
  await inFavorites.getByRole("button", { name: "Quitar de favoritos" }).click();
  await expect(page.getByRole("button", { name: partName, exact: true })).toHaveCount(0);
});
