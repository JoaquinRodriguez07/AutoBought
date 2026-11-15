import { test, expect } from "@playwright/test";
import { ANA, SELLER, addedNotice, approvePayment, emptyCart, logIn } from "../helpers.js";

// El recorrido de la demo, de punta a punta: Ana elige su auto, busca con un
// error de tipeo, ve que el repuesto le sirve, lo guarda en favoritos, agrega
// una dirección nueva y compra. El pago se aprueba como lo haría Mercado
// Pago (approvePayment). El vendedor lo ve pagado, le deja una nota y lo
// envía; Ana confirma que le llegó y el pedido queda entregado.
//
// Usa una dirección con nombre único y la borra al final, para poder correr
// varias veces sobre la misma base.

const CAR = { brand: "Toyota", model: "Corolla", year: "2015" };
const ADDRESS = "Taller E2E";

// Borra la dirección del taller si quedó de una corrida anterior (la app no
// deja guardar dos veces la misma).
async function removeWorkshop(page) {
  await page.goto("/direcciones");
  await expect(page.getByRole("heading", { name: "Mis direcciones" })).toBeVisible();
  const remove = page.getByRole("button", { name: `Eliminar la dirección ${ADDRESS}` });
  await expect(page.getByRole("button", { name: "Agregar dirección" })).toBeVisible();
  while (await remove.count()) {
    await remove.first().click();
    const confirm = page.getByRole("alertdialog");
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.getByRole("button", { name: /eliminar/i }).last().click();
    }
    await expect(remove).toHaveCount(0);
  }
}

test("recorrido completo: buscar, comprar, pagar, preparar, enviar y recibir", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await logIn(page, ANA);
  await emptyCart(page);

  // 1. Elige su auto en el inicio.
  await page.goto("/");
  await page.getByRole("combobox", { name: "MARCA" }).first().selectOption(CAR.brand);
  await page.getByRole("combobox", { name: "MODELO" }).first().selectOption(CAR.model);
  const year = page.getByRole("combobox", { name: "AÑO" }).first();
  await expect(year.locator(`option[value="${CAR.year}"]`)).toHaveCount(1);
  await year.selectOption(CAR.year);
  await page.getByRole("button", { name: "Buscar repuestos" }).first().click();
  await expect(page.getByText(`Mostrando repuestos para: ${CAR.brand} ${CAR.model} ${CAR.year}`)).toBeVisible();

  // 2. Busca con un error de tipeo: aparecen pastillas, y todas para su auto.
  const search = page.getByRole("searchbox", { name: "Buscar repuesto por nombre o código" });
  await search.fill("pastias de freno");
  await search.press("Enter");
  const cards = page.locator("article");
  await expect(cards.first()).toBeVisible();
  await expect(cards.first()).toContainText(/pastilla/i);
  for (const fitsFor of await cards.getByText(/^Para /).allInnerTexts()) {
    expect(fitsFor).toContain(`${CAR.brand} ${CAR.model}`);
  }

  // 3. El detalle dice que es compatible; lo guarda en favoritos y al carrito.
  await cards.first().getByRole("button", { name: /^Ver detalle de / }).click();
  await expect(page.getByRole("heading", { name: "Compatibilidad" })).toBeVisible();
  await expect(page.getByText(/No es compatible/)).toHaveCount(0);
  const addFavorite = page.getByRole("button", { name: "Agregar a favoritos" });
  if (await addFavorite.isVisible().catch(() => false)) await addFavorite.click();
  await expect(page.getByRole("button", { name: /favoritos/i }).first()).not.toHaveText("Agregar a favoritos");
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(addedNotice(page)).toBeVisible();

  // 4. Agrega la dirección del taller como principal.
  await removeWorkshop(page);
  await page.getByRole("button", { name: "Agregar dirección" }).click();
  const form = page.getByRole("form", { name: "Nueva dirección" }).or(page.locator("form").filter({ hasText: "Nueva dirección" }));
  await form.getByRole("textbox", { name: "NOMBRE DE LA DIRECCIÓN *" }).fill(ADDRESS);
  await form.getByRole("textbox", { name: "CALLE *" }).fill("Av. Rivera");
  await form.getByRole("textbox", { name: "NÚMERO *" }).fill("2525");
  await form.getByRole("textbox", { name: "CIUDAD *" }).fill("Montevideo");
  await form.getByRole("combobox", { name: "DEPARTAMENTO *" }).selectOption("Montevideo");
  await form.getByRole("checkbox", { name: "Usar como dirección principal" }).check();
  await form.getByRole("button", { name: "Guardar dirección" }).click();
  await expect(page.getByText(ADDRESS)).toBeVisible();

  // 5. Compra con esa dirección. Mercado Pago no se llama: el link de pago
  // vuelve a la tienda, y después el pago se aprueba como lo haría el aviso.
  await page.route("**/api/v1/pagos/*", async (route) => {
    const pedido = route.request().url().split("/").pop();
    await route.fulfill({ json: { url: `/pago?pedido=${pedido}&collection_status=null` } });
  });
  await page.goto("/carrito");
  await page.getByRole("button", { name: "FINALIZAR COMPRA" }).click();
  const dialog = page.getByRole("dialog");
  const shipTo = dialog.getByLabel("DIRECCIÓN DE ENVÍO");
  // La principal viene elegida: la del taller, recién agregada.
  await expect(shipTo.locator("option:checked")).toHaveText("Av. Rivera 2525, Montevideo");
  await dialog.getByRole("button", { name: "IR A PAGAR" }).click();
  await expect(page).toHaveURL(/\/pago\?pedido=\d+/);
  const order = new URL(page.url()).searchParams.get("pedido");
  approvePayment(order);

  // 6. El vendedor: el resumen con IA no está (en CI no hay clave de Gemini)
  // y el dashboard sigue igual. Abre el pedido, ya pagado, y lo prepara.
  const sellerContext = await browser.newContext();
  const seller = await sellerContext.newPage();
  await logIn(seller, SELLER);
  await seller.goto("/dashboard");
  await expect(seller.getByText("Resumen no disponible")).toBeVisible();

  await seller.goto(`/dashboard/pedidos/${order}`);
  await expect(seller.getByText("Pagado").first()).toBeVisible();
  await expect(seller.getByText("Av. Rivera 2525")).toBeVisible();
  await seller.getByRole("textbox", { name: "Nota interna" }).fill("Entregar de tarde (E2E).");
  await seller.getByRole("button", { name: "Guardar nota" }).click();
  await expect(seller.getByText("Nota guardada.")).toBeVisible();
  for (const next of ["Empaquetando", "Enviado"]) {
    // Los avisos de arriba a la derecha tapan el botón un par de segundos:
    // el clic se dispara directo sobre él.
    await seller.getByRole("button", { name: `Pasar el pedido #${order} a ${next}` }).dispatchEvent("click");
    await expect(seller.getByText(`Pedido #${order}: ${next}.`).first()).toBeVisible();
  }
  await sellerContext.close();

  // 7. Ana ve que está en camino, confirma que le llegó y queda entregado.
  await page.goto(`/pedidos/${order}`);
  await expect(page.getByText("Tu pedido está en camino")).toBeVisible();
  await page.getByRole("button", { name: "Ya lo recibí" }).click();
  await expect(page.getByRole("status").filter({ hasText: /entregado|recibido/i })).toBeVisible();
  await expect(page.getByLabel("Seguimiento del pedido").locator('[aria-current="step"]')).toContainText("Entregado");
  // La nota interna es solo de la tienda.
  await expect(page.getByText("Entregar de tarde (E2E).")).toHaveCount(0);

  // Limpieza: la dirección del taller (el pedido guarda su propia copia).
  await removeWorkshop(page);
});
