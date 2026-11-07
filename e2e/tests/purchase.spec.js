import { test, expect } from "@playwright/test";
import { ANA, addedNotice, logIn, emptyCart } from "../helpers.js";

// El pago se hace en Mercado Pago, que acá no se llama: el link de pago se
// reemplaza por la vuelta a la tienda, como si el cliente hubiera vuelto
// sin pagar. Ana ya tiene direcciones guardadas por el seed.
test("compra: con la dirección guardada, va a pagar y el pedido queda pendiente en Mis pedidos", async ({ page }) => {
  await logIn(page, ANA);
  await emptyCart(page);

  await page.route("**/api/v1/pagos/*", async (route) => {
    const pedido = route.request().url().split("/").pop();
    await route.fulfill({ json: { url: `/pago?pedido=${pedido}&collection_status=null` } });
  });

  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Agregar", exact: true }).first().click();
  await addedNotice(page).getByRole("button", { name: "Ver carrito" }).click();

  await page.getByRole("button", { name: "FINALIZAR COMPRA" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("DIRECCIÓN DE ENVÍO")).toBeVisible();
  await dialog.getByRole("button", { name: "IR A PAGAR" }).click();

  await expect(page).toHaveURL(/\/pago\?pedido=\d+/);
  const orderNumber = new URL(page.url()).searchParams.get("pedido");
  await expect(page.getByText("El pago no se pudo completar")).toBeVisible();
  await expect(page.getByRole("button", { name: "REINTENTAR PAGO" })).toBeVisible();

  // "Seguir mi pedido" lleva directo al detalle del pedido en "Mis pedidos".
  await page.getByRole("button", { name: "Seguir mi pedido" }).click();
  await expect(page).toHaveURL(new RegExp(`/pedidos/${orderNumber}$`));
  await expect(page.getByText("Mercado Pago (pendiente)")).toBeVisible();
  await expect(page.getByRole("button", { name: `Pagar el pedido #${orderNumber} con Mercado Pago` })).toBeVisible();
});
