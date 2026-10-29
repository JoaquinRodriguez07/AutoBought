import { test, expect } from "@playwright/test";
import { ANA, avisoAgregado, iniciarSesion, vaciarCarrito } from "../helpers.js";

// El pago se hace en Mercado Pago, que acá no se llama: el link de pago se
// reemplaza por la vuelta a la tienda, como si el cliente hubiera vuelto
// sin pagar. Ana ya tiene direcciones guardadas por el seed.
test("compra: con la dirección guardada, va a pagar y el pedido queda pendiente en el historial", async ({ page }) => {
  await iniciarSesion(page, ANA);
  await vaciarCarrito(page);

  await page.route("**/api/v1/pagos/*", async (route) => {
    const pedido = route.request().url().split("/").pop();
    await route.fulfill({ json: { url: `/pago?pedido=${pedido}&collection_status=null` } });
  });

  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Agregar", exact: true }).first().click();
  await avisoAgregado(page).getByRole("button", { name: "Ver carrito" }).click();

  await page.getByRole("button", { name: "FINALIZAR COMPRA" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByLabel("DIRECCIÓN DE ENVÍO")).toBeVisible();
  await dialogo.getByRole("button", { name: "IR A PAGAR" }).click();

  await expect(page).toHaveURL(/\/pago\?pedido=\d+/);
  const numero = new URL(page.url()).searchParams.get("pedido");
  await expect(page.getByText("El pago no se pudo completar")).toBeVisible();
  await expect(page.getByRole("button", { name: "REINTENTAR PAGO" })).toBeVisible();

  await page.getByRole("button", { name: "Ver mis compras" }).click();
  await page.getByRole("button", { name: `Ver detalle del pedido #${numero}` }).click();
  await expect(page.getByText("Pago: Mercado Pago (pendiente)")).toBeVisible();
  await expect(page.getByRole("button", { name: "PAGAR CON MERCADO PAGO" })).toBeVisible();
});
