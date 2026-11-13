// Recorridos E2E para borrar una cuenta de cliente.

import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { ANA, linkFromMail, logIn } from "../helpers.js";

const API_URL = process.env.E2E_API_URL || "http://127.0.0.1:8000";
const PASSWORD = "PruebaE2e2026x";
const ORDER_PENDING_MESSAGE =
  "Aún hay pedidos pendientes. Esperá a que se completen o cancelalos para poder borrar tu cuenta.";

async function registerAndVerify(page, request, email = `e2e-delete-${randomUUID()}@autobought.com`) {
  await page.goto("/registro");
  await page.getByPlaceholder("Tu nombre").fill("Prueba");
  await page.getByPlaceholder("Tu apellido").fill("Automática");
  await page.getByPlaceholder("tu@email.com").fill(email);
  await page.getByPlaceholder("099 123 456").fill(`099${String(Date.now()).slice(-6)}`);
  await page.getByPlaceholder("Mínimo 8 caracteres").fill(PASSWORD);
  await page.getByPlaceholder("Repetí tu contraseña").fill(PASSWORD);
  await page.getByText("Acepto los términos y condiciones.").click();
  await page.getByRole("button", { name: "CREAR CUENTA" }).click();
  await expect(page).not.toHaveURL(/\/registro/);

  const verificationLink = await linkFromMail(request, email, "/verificar-correo");
  await page.goto(verificationLink);
  await expect(page.getByText("Tu correo quedó verificado")).toBeVisible();
  return { email, password: PASSWORD };
}

async function currentToken(page) {
  return page.evaluate(() => {
    const raw =
      localStorage.getItem("autobought-sesion") ||
      sessionStorage.getItem("autobought-sesion");
    return raw ? JSON.parse(raw).token : null;
  });
}

async function clientRequest(request, page, method, path, data) {
  const token = await currentToken(page);
  return request.fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
}

async function addPersonalData(request, page) {
  const addressResponse = await clientRequest(request, page, "POST", "/api/v1/addresses", {
    personal_name: "Casa E2E",
    street: "Av. Italia",
    number: "1234",
    city: "Montevideo",
    department: "Montevideo",
    is_primary: true,
  });
  expect(addressResponse.status()).toBe(201);

  const partsResponse = await request.get(`${API_URL}/api/v1/parts`);
  expect(partsResponse.status()).toBe(200);
  const { parts } = await partsResponse.json();
  const part = parts.find((item) => item.stock > 0);
  expect(part).toBeTruthy();

  const favoriteResponse = await clientRequest(
    request,
    page,
    "PUT",
    `/api/v1/favorites/${part.id}`
  );
  expect(favoriteResponse.status()).toBe(204);

  const cartResponse = await clientRequest(request, page, "POST", "/api/v1/cart/items", {
    part_id: part.id,
    amount: 1,
  });
  expect(cartResponse.status()).toBe(200);
}

async function openDeleteDialog(page) {
  await page.goto("/cuenta");
  await page.getByRole("button", { name: "Borrar mi cuenta", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    "ATENCIÓN! Borrar tu cuenta es irreversible. Para confirmar, escribí tu contraseña abajo."
  );
  return dialog;
}

test("borrar la cuenta cierra la sesión, elimina los datos personales y permite registrarse otra vez", async ({
  page,
  request,
}) => {
  const account = await registerAndVerify(page, request);
  await addPersonalData(request, page);
  const oldToken = await currentToken(page);

  const dialog = await openDeleteDialog(page);
  await dialog.getByRole("textbox", { name: "CONTRASEÑA" }).fill(account.password);
  await dialog.getByRole("button", { name: "Borrar Cuenta", exact: true }).click();

  await expect(dialog).toHaveCount(0);
  await expect.poll(() => currentToken(page)).toBeNull();
  const oldSessionResponse = await request.get(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${oldToken}` },
  });
  expect(oldSessionResponse.status()).toBe(401);

  await page.goto("/login");
  await page.getByPlaceholder("tu@email.com").fill(account.email);
  await page.getByPlaceholder("••••••••").fill(account.password);
  await page.locator("form").getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/correo|contraseña/i);

  await registerAndVerify(page, request, account.email);
  const addresses = await clientRequest(request, page, "GET", "/api/v1/addresses");
  const favorites = await clientRequest(request, page, "GET", "/api/v1/favorites");
  const cart = await clientRequest(request, page, "GET", "/api/v1/cart");
  const orders = await clientRequest(request, page, "GET", "/api/v1/orders");

  expect(await addresses.json()).toEqual([]);
  expect((await favorites.json()).parts).toEqual([]);
  expect((await cart.json()).items).toEqual([]);
  expect((await orders.json()).orders).toEqual([]);

  const cleanupDialog = await openDeleteDialog(page);
  await cleanupDialog.getByRole("textbox", { name: "CONTRASEÑA" }).fill(account.password);
  await cleanupDialog.getByRole("button", { name: "Borrar Cuenta", exact: true }).click();
  await expect(cleanupDialog).toHaveCount(0);
});

test("una contraseña incorrecta no borra la cuenta y se puede cerrar el diálogo", async ({
  page,
  request,
}) => {
  const account = await registerAndVerify(page, request);
  const token = await currentToken(page);
  let dialog = await openDeleteDialog(page);
  await dialog.getByRole("textbox", { name: "CONTRASEÑA" }).fill("Incorrecta2026x");
  await dialog.getByRole("button", { name: "Borrar Cuenta", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Contraseña equivocada.");

  const profileResponse = await request.get(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(profileResponse.status()).toBe(200);

  await page.mouse.click(2, 2);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  dialog = await openDeleteDialog(page);
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  dialog = await openDeleteDialog(page);
  await dialog.getByRole("textbox", { name: "CONTRASEÑA" }).fill(account.password);
  await dialog.getByRole("button", { name: "Borrar Cuenta", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("un pedido pagado que sigue en curso impide borrar la cuenta", async ({ page, request }) => {
  await logIn(page, ANA);
  const ordersResponse = await clientRequest(request, page, "GET", "/api/v1/orders");
  expect(ordersResponse.status()).toBe(200);
  const { orders } = await ordersResponse.json();
  expect(
    orders.some(
      (order) =>
        !["delivered", "cancelled"].includes(order.status) &&
        order.payment_status === "approved"
    )
  ).toBe(true);

  const dialog = await openDeleteDialog(page);
  await dialog.getByRole("textbox", { name: "CONTRASEÑA" }).fill(ANA.password);
  await dialog.getByRole("button", { name: "Borrar Cuenta", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(ORDER_PENDING_MESSAGE);
  await expect(dialog).toBeVisible();
});
