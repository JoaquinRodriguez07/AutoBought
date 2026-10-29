import { test, expect } from "@playwright/test";
import { VENDEDOR, enlaceDelMail, iniciarSesion } from "../helpers.js";

test("registro: crear una cuenta y verificar el correo con el enlace del mail", async ({ page, request }) => {
  // Un correo nuevo en cada corrida, así se puede repetir sin chocar. El
  // mail no sale a ningún lado: lo atrapa Mailpit.
  const sufijo = Date.now();
  const email = `e2e-${sufijo}@autobought.com`;
  const celular = `099${String(sufijo).slice(-6)}`;

  await page.goto("/registro");
  await page.getByPlaceholder("Tu nombre").fill("Prueba");
  await page.getByPlaceholder("Tu apellido").fill("Automática");
  await page.getByPlaceholder("tu@email.com").fill(email);
  await page.getByPlaceholder("099 123 456").fill(celular);
  await page.getByPlaceholder("Mínimo 8 caracteres").fill("PruebaE2e2026x");
  await page.getByPlaceholder("Repetí tu contraseña").fill("PruebaE2e2026x");
  await page.getByText("Acepto los términos y condiciones.").click();
  await page.getByRole("button", { name: "CREAR CUENTA" }).click();

  await expect(page).toHaveURL(/\/$/);

  const enlace = await enlaceDelMail(request, email, "/verificar-correo");
  await page.goto(enlace);
  await expect(page.getByText("Tu correo quedó verificado")).toBeVisible();
});

test("vendedor: inicia sesión y entra al dashboard", async ({ page }) => {
  await iniciarSesion(page, VENDEDOR);
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { level: 1, name: "Resumen" })).toBeVisible();
});
