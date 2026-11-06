import { test, expect } from "@playwright/test";
import { enlaceDelMail } from "../helpers.js";

const API_URL = process.env.E2E_API_URL || "http://localhost:8000";
const PASSWORD = "PruebaE2e2026x";

async function registrarCuenta(page, request) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const email = `e2e-baja-${suffix}@autobought.com`;
  const phone = `099${suffix.replace(/\D/g, "").slice(-6).padStart(6, "0")}`;

  await page.goto("/registro");
  await page.getByPlaceholder("Tu nombre").fill("Prueba");
  await page.getByPlaceholder("Tu apellido").fill("Baja");
  await page.getByPlaceholder("tu@email.com").fill(email);
  await page.getByPlaceholder("099 123 456").fill(phone);
  await page.getByPlaceholder("Mínimo 8 caracteres").fill(PASSWORD);
  await page.getByPlaceholder("Repetí tu contraseña").fill(PASSWORD);
  await page.getByText("Acepto los términos y condiciones.").click();
  await page.getByRole("button", { name: "CREAR CUENTA" }).click();
  await expect(page).toHaveURL(/\/$/);

  const verificationLink = await enlaceDelMail(request, email, "/verificar-correo");
  await page.goto(verificationLink);
  await expect(page.getByText("Tu correo quedó verificado")).toBeVisible();
  await page.getByRole("button", { name: "IR A LA TIENDA" }).click();

  return { email, phone };
}

async function abrirDialogoDesdePerfil(page) {
  await page.goto("/perfil");
  await page.getByRole("navigation", { name: "Mi cuenta" })
    .getByRole("button", { name: "Borrar mi cuenta" })
    .click();
  return page.getByRole("dialog");
}

async function tokenDeSesion(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("autobought-sesion"))?.token);
}

async function crearPedidoPendiente(page) {
  const token = await tokenDeSesion(page);
  const headers = { Authorization: `Bearer ${token}` };

  const addressResponse = await page.request.post(`${API_URL}/api/v1/addresses`, {
    headers,
    data: {
      personal_name: "Prueba Baja",
      street: "Av. Italia",
      number: "1234",
      city: "Montevideo",
      department: "Montevideo",
      is_primary: true,
    },
  });
  expect(addressResponse.status()).toBe(201);
  const address = await addressResponse.json();

  const partsResponse = await page.request.get(`${API_URL}/api/v1/parts`);
  expect(partsResponse.ok()).toBeTruthy();
  const { parts } = await partsResponse.json();
  const part = parts.find((item) => item.stock > 0);
  test.skip(!part, "the E2E catalog needs at least one in-stock part");

  const cartResponse = await page.request.post(`${API_URL}/api/v1/cart/items`, {
    headers,
    data: { part_id: part.id, amount: 1 },
  });
  expect(cartResponse.ok()).toBeTruthy();

  const orderResponse = await page.request.post(`${API_URL}/api/v1/orders`, {
    headers,
    data: { shipping_address_id: address.shipping_address_id },
  });
  if (orderResponse.status() === 503) {
    const body = await orderResponse.json();
    test.skip(
      body.detail === "Por ahora no podemos cobrar. Tu carrito quedó igual: probá de nuevo en un rato.",
      "the local backend needs MERCADOPAGO_ACCESS_TOKEN to create orders"
    );
  }
  expect(orderResponse.status()).toBe(201);
  return orderResponse.json();
}

async function iniciarBorrado(dialog, password = PASSWORD) {
  await dialog.getByRole("textbox", { name: "CONTRASEÑA" }).fill(password);
  await dialog.getByRole("button", { name: "Borrar Cuenta" }).click();
}

test("delete account: correct password clears the session, blocks old login, and allows re-registration", async ({
  page,
  request,
}) => {
  const { email, phone } = await registrarCuenta(page, request);
  const oldToken = await tokenDeSesion(page);

  const dialog = await abrirDialogoDesdePerfil(page);
  await expect(dialog).toContainText(
    "ATENCIÓN! Borrar tu cuenta es irreversible. Para confirmar, escribí tu contraseña abajo."
  );
  await iniciarBorrado(dialog);

  await expect(dialog).not.toBeVisible();
  await expect.poll(() =>
    page.evaluate(() => localStorage.getItem("autobought-sesion"))
  ).toBeNull();
  await expect.poll(() =>
    page.evaluate(() => sessionStorage.getItem("autobought-sesion"))
  ).toBeNull();

  const oldSessionResponse = await page.request.get(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${oldToken}` },
  });
  expect(oldSessionResponse.status()).toBe(401);

  await page.goto("/login");
  await page.getByPlaceholder("tu@email.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("button", { name: "INICIAR SESIÓN", exact: true }).click();
  await expect(page.getByText("Correo electrónico o contraseña incorrectos.")).toBeVisible();

  // The original address is available to a new account, with no inherited orders.
  await page.goto("/registro");
  await page.getByPlaceholder("Tu nombre").fill("Prueba");
  await page.getByPlaceholder("Tu apellido").fill("Nueva");
  await page.getByPlaceholder("tu@email.com").fill(email);
  await page.getByPlaceholder("099 123 456").fill(phone);
  await page.getByPlaceholder("Mínimo 8 caracteres").fill(PASSWORD);
  await page.getByPlaceholder("Repetí tu contraseña").fill(PASSWORD);
  await page.getByText("Acepto los términos y condiciones.").click();
  await page.getByRole("button", { name: "CREAR CUENTA" }).click();
  await expect(page).toHaveURL(/\/$/);

  const newToken = await tokenDeSesion(page);
  expect(newToken).not.toBe(oldToken);
  const ordersResponse = await page.request.get(`${API_URL}/api/v1/orders`, {
    headers: { Authorization: `Bearer ${newToken}` },
  });
  expect(ordersResponse.status()).toBe(200);
  expect(await ordersResponse.json()).toEqual({ orders: [] });
});

test("incorrect password is reported and leaves the account session active", async ({ page, request }) => {
  await registrarCuenta(page, request);
  const token = await tokenDeSesion(page);
  const dialog = await abrirDialogoDesdePerfil(page);

  await iniciarBorrado(dialog, "Incorrecta2026x");

  await expect(dialog.getByRole("alert")).toHaveText("Contraseña equivocada.");
  expect(await tokenDeSesion(page)).toBe(token);
  const profileResponse = await page.request.get(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(profileResponse.status()).toBe(200);

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).not.toBeVisible();
});

test("an unpaid ongoing order blocks deletion and preserves the account and order", async ({
  page,
  request,
}) => {
  const { email } = await registrarCuenta(page, request);
  const order = await crearPedidoPendiente(page);
  const token = await tokenDeSesion(page);
  const dialog = await abrirDialogoDesdePerfil(page);

  await iniciarBorrado(dialog);

  await expect(dialog.getByRole("alert")).toHaveText(
    "Aún hay pedidos pendientes. Esperá a que se completen o cancelalos para poder borrar tu cuenta."
  );
  const profileResponse = await page.request.get(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(profileResponse.status()).toBe(200);
  expect((await profileResponse.json()).email).toBe(email);

  const ordersResponse = await page.request.get(`${API_URL}/api/v1/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(ordersResponse.status()).toBe(200);
  expect((await ordersResponse.json()).orders.map((item) => item.order_id)).toContain(order.order_id);
});
