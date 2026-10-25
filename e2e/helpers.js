import { expect } from "@playwright/test";

// Usuarios de backend/scripts/seed_demo_users.py (solo existen en la base
// de prueba; no son cuentas reales).
export const ANA = { email: "ana.perez@autobought.com", password: "Repuestos2026" };
export const VENDEDOR = { email: "vendedor@autobought.com", password: "Ventas2026x" };

const MAILPIT_URL = process.env.E2E_MAILPIT_URL || "http://localhost:8025";

export async function iniciarSesion(page, { email, password }) {
  await page.goto("/login");
  await page.getByPlaceholder("tu@email.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "INICIAR SESIÓN", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

// Vacía el carrito desde la pantalla del carrito, para que la compra
// arranque igual sin importar lo que dejó un recorrido anterior.
export async function vaciarCarrito(page) {
  await page.goto("/carrito");
  const vaciar = page.getByRole("button", { name: "Vaciar carrito" });
  if (await vaciar.isVisible().catch(() => false)) await vaciar.click();
  await expect(page.getByRole("button", { name: /^Quitar .* del carrito$/ })).toHaveCount(0);
}

// Espera el mail que el backend le mandó a `email` (Mailpit lo atrapa) y
// devuelve el enlace a `ruta` que trae adentro.
export async function enlaceDelMail(request, email, ruta) {
  let enlace;
  await expect
    .poll(async () => {
      const busqueda = await request.get(`${MAILPIT_URL}/api/v1/search`, {
        params: { query: `to:"${email}"` },
      });
      const { messages = [] } = await busqueda.json();
      if (!messages.length) return null;
      const mail = await (await request.get(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)).json();
      enlace = `${mail.HTML || ""} ${mail.Text || ""}`.match(
        new RegExp(`https?://[^"'\\s<>]*${ruta}[^"'\\s<>]*`)
      )?.[0];
      return enlace ?? null;
    }, { message: `no llegó el mail a ${email}`, timeout: 20_000 })
    .not.toBeNull();
  return enlace.replaceAll("&amp;", "&");
}

// El aviso "Agregado al carrito" (ConfirmacionAgregarCarrito).
export const avisoAgregado = (page) =>
  page.getByRole("status").filter({ hasText: "Agregado al carrito" });

// Las cintas de marcas y fabricantes del inicio se mueven sin parar, así
// que Playwright nunca las ve "quietas" para hacer clic: se dispara el
// clic directo sobre el botón.
export const clicEnCinta = (boton) => boton.first().dispatchEvent("click");
