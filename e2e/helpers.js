import { expect } from "@playwright/test";
import { execSync } from "node:child_process";

// Usuarios de backend/scripts/seed_demo_users.py (solo existen en la base
// de prueba; no son cuentas reales).
export const ANA = { email: "ana.perez@autobought.com", password: "Repuestos2026" };
export const SELLER = { email: "vendedor@autobought.com", password: "Ventas2026x" };

const MAILPIT_URL = process.env.E2E_MAILPIT_URL || "http://localhost:8025";

export async function logIn(page, { email, password }) {
  await page.goto("/login");
  await page.getByPlaceholder("tu@email.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  // El del formulario: la barra de arriba también puede tener "Iniciar sesión".
  await page.locator("form").getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

// Vacía el carrito desde la pantalla del carrito, para que la compra
// arranque igual sin importar lo que dejó un recorrido anterior.
export async function emptyCart(page) {
  await page.goto("/carrito");
  const clearButton = page.getByRole("button", { name: "Vaciar carrito" });
  // El carrito se carga después de abrir la pantalla: se espera a ver o el
  // botón o el carrito vacío, si no el botón todavía no está y no se vacía.
  const emptyTitle = page.getByRole("heading", { name: "Tu carrito está vacío" });
  await expect(clearButton.or(emptyTitle)).toBeVisible();
  if (await clearButton.isVisible()) await clearButton.click();
  await expect(page.getByRole("button", { name: /^Quitar .* del carrito$/ })).toHaveCount(0);
}

// Espera el mail que el backend le mandó a `email` (Mailpit lo atrapa) y
// devuelve el enlace a `ruta` que trae adentro.
export async function linkFromMail(request, email, path) {
  let link;
  await expect
    .poll(async () => {
      const search = await request.get(`${MAILPIT_URL}/api/v1/search`, {
        params: { query: `to:"${email}"` },
      });
      const { messages = [] } = await search.json();
      if (!messages.length) return null;
      const mail = await (await request.get(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)).json();
      link = `${mail.HTML || ""} ${mail.Text || ""}`.match(
        new RegExp(`https?://[^"'\\s<>]*${path}[^"'\\s<>]*`)
      )?.[0];
      return link ?? null;
    }, { message: `no llegó el mail a ${email}`, timeout: 20_000 })
    .not.toBeNull();
  return link.replaceAll("&amp;", "&");
}

// El aviso "Agregado al carrito" (ConfirmacionAgregarCarrito).
export const addedNotice = (page) =>
  page.getByRole("status").filter({ hasText: "Agregado al carrito" });

// Las cintas de marcas y fabricantes del inicio se mueven sin parar, así
// que Playwright nunca las ve "quietas" para hacer clic: se dispara el
// clic directo sobre el botón.
export const clickInRibbon = (button) => button.first().dispatchEvent("click");

// Aprueba el pago del pedido `orderId` como lo haría Mercado Pago, con
// backend/scripts/e2e_approve_payment.py (la misma función que el webhook).
// En CI corre dentro del contenedor del backend; en local se puede cambiar
// el comando con E2E_APPROVE_CMD (el número de pedido va al final).
export function approvePayment(orderId) {
  const command =
    process.env.E2E_APPROVE_CMD ||
    "docker compose exec -T -e E2E_APROBAR_PAGOS=1 backend uv run python -m scripts.e2e_approve_payment";
  execSync(`${command} ${Number(orderId)}`, { cwd: "..", stdio: "pipe", env: { ...process.env, E2E_APROBAR_PAGOS: "1" } });
}
