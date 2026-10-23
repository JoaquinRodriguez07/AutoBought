import { test, expect } from "@playwright/test";
import { ANA, avisoAgregado, iniciarSesion, vaciarCarrito } from "../helpers.js";

// Los pagos están simulados (frontend/src/pasarelaPagos.js): no se cobra
// nada. Ana ya tiene direcciones y tarjetas guardadas por el seed.
test("compra: con la dirección y la tarjeta guardadas, y aparece en el historial", async ({ page }) => {
  await iniciarSesion(page, ANA);
  await vaciarCarrito(page);

  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Agregar", exact: true }).first().click();
  await avisoAgregado(page).getByRole("button", { name: "Ver carrito" }).click();

  await page.getByRole("button", { name: "FINALIZAR COMPRA" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByLabel("DIRECCIÓN DE ENVÍO")).toBeVisible();
  await expect(dialogo.getByLabel("MÉTODO DE PAGO")).toBeVisible();
  await dialogo.getByRole("button", { name: "CONFIRMAR COMPRA" }).click();

  await expect(dialogo.getByRole("heading", { name: "¡Compra confirmada!" })).toBeVisible();
  const numero = (await dialogo.getByText(/^#\d+$/).innerText()).trim();
  await dialogo.getByRole("button", { name: "ACEPTAR" }).click();

  await page.goto("/historial");
  await expect(page.getByRole("button", { name: `Ver detalle del pedido ${numero}` })).toBeVisible();
});
