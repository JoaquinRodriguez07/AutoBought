// Recorridos E2E de cuentas: registro con verificación del correo y entrada del vendedor.

import { test, expect } from "@playwright/test";
import { SELLER, linkFromMail, logIn } from "../helpers.js";

test("registro: crear una cuenta y verificar el correo con el enlace del mail", async ({ page, request }) => {
  // Un correo nuevo en cada corrida, así se puede repetir sin chocar. El
  // mail no sale a ningún lado: lo atrapa Mailpit.
  const suffix = Date.now();
  const email = `e2e-${suffix}@autobought.com`;
  const phoneNumber = `099${String(suffix).slice(-6)}`;

  await page.goto("/registro");
  await page.getByPlaceholder("Tu nombre").fill("Prueba");
  await page.getByPlaceholder("Tu apellido").fill("Automática");
  await page.getByPlaceholder("tu@email.com").fill(email);
  await page.getByPlaceholder("099 123 456").fill(phoneNumber);
  await page.getByPlaceholder("Mínimo 8 caracteres").fill("PruebaE2e2026x");
  await page.getByPlaceholder("Repetí tu contraseña").fill("PruebaE2e2026x");
  await page.getByText("Acepto los términos y condiciones.").click();
  await page.getByRole("button", { name: "CREAR CUENTA" }).click();

  await expect(page).toHaveURL(/\/$/);

  const link = await linkFromMail(request, email, "/verificar-correo");
  await page.goto(link);
  await expect(page.getByText("Tu correo quedó verificado")).toBeVisible();
});

test("vendedor: inicia sesión y entra al dashboard", async ({ page }) => {
  await logIn(page, SELLER);
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { level: 1, name: "Resumen" })).toBeVisible();
});
