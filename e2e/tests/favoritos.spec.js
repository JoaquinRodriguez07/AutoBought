import { test, expect } from "@playwright/test";
import { ANA, avisoAgregado, iniciarSesion } from "../helpers.js";

test("favoritos: marcar uno, verlo en la lista y agregarlo al carrito desde ahí", async ({ page }) => {
  await iniciarSesion(page, ANA);
  await page.goto("/catalogo");

  // Se elige un repuesto que no sea favorito y después se lo sigue por el
  // nombre: al marcarlo, deja de cumplir el filtro con el que se eligió.
  const nombre = await page
    .locator("article")
    .filter({ has: page.getByRole("button", { name: "Marcar como favorito" }) })
    .first()
    .locator("h3")
    .innerText();
  const tarjeta = page.locator("article").filter({ has: page.getByRole("heading", { name: nombre, exact: true }) });
  await tarjeta.getByRole("button", { name: "Marcar como favorito" }).click();
  await expect(tarjeta.getByRole("button", { name: "Quitar de favoritos" })).toBeVisible();

  await page.getByTitle("Favoritos").click();
  await expect(page).toHaveURL(/\/favoritos$/);

  const enFavoritos = page
    .getByRole("button", { name: nombre, exact: true })
    .locator("xpath=ancestor::div[.//button[@aria-label='Quitar de favoritos']][1]");
  await expect(enFavoritos).toBeVisible();

  await enFavoritos.getByRole("button", { name: /agregar al carrito/i }).click();
  await expect(avisoAgregado(page)).toContainText(nombre);
  await avisoAgregado(page).getByRole("button", { name: "Deshacer" }).click();
  await expect(avisoAgregado(page)).toHaveCount(0);

  // Se deja como estaba: se saca de favoritos.
  await enFavoritos.getByRole("button", { name: "Quitar de favoritos" }).click();
  await expect(page.getByRole("button", { name: nombre, exact: true })).toHaveCount(0);
});
