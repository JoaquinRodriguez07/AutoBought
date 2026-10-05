jest.mock("./auth", () => ({
  obtenerSesion: jest.fn(),
}));

import {
  actualizarItemCarrito,
  actualizarPerfil,
  cambiarPassword,
  agregarItemCarrito,
  crearDireccion,
  crearMetodoPago,
  eliminarDireccionAPI,
  eliminarItemCarrito,
  eliminarMetodoPagoAPI,
  login,
  marcarDireccionPrincipal,
  marcarMetodoPagoPrincipal,
  obtenerCarrito,
  obtenerCategorias,
  obtenerDirecciones,
  obtenerMarcas,
  obtenerMetodosPago,
  obtenerModelos,
  obtenerPerfil,
  obtenerRecomendaciones,
  obtenerRepuestos,
  registrar,
  vaciarCarritoAPI,
} from "./api";
import { obtenerSesion } from "./auth";
import { IMAGEN_PLACEHOLDER } from "./mapearRepuesto";

const BASE_URL = "http://127.0.0.1:8000";
const backendPart = {
  id: 21,
  name: "Disco de freno",
  part_code: "DF-21",
  category: "Frenos",
  price: 2450,
  stock: 7,
  compatible_brands: ["Volkswagen", "Audi"],
};
const uiPart = {
  id: "21",
  partId: 21,
  nombre: "Disco de freno",
  codigo: "DF-21",
  categoria: "Frenos",
  precio: 2450,
  stock: 7,
  marca: "Volkswagen Audi",
  marcaPrincipal: "Volkswagen",
  imagen: IMAGEN_PLACEHOLDER,
};

/**
 * Creates a fetch response stub with a resolving or rejecting JSON mock.
 * @param {*} data - Value resolved by json() when no jsonError is supplied.
 * @param {Object} [options={}] - Response metadata and JSON failure overrides.
 * @param {number} [options.status=200] - HTTP status code.
 * @param {boolean} [options.ok=true] - Success flag, independent of status.
 * @param {Error} [options.jsonError] - Truthy error that makes json() reject.
 * @returns {{ok: boolean, status: number, json: Function}} Fetch response stub.
 */
function response(data, { status = 200, ok = true, jsonError } = {}) {
  return {
    ok,
    status,
    json: jsonError ? jest.fn().mockRejectedValue(jsonError) : jest.fn().mockResolvedValue(data),
  };
}

beforeEach(() => {
  global.fetch = jest.fn();
  obtenerSesion.mockReturnValue({ token: "jwt-token" });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("login", () => {
  it("posts credentials and returns the successful response", async () => {
    const data = { access_token: "token", token_type: "bearer" };
    fetch.mockResolvedValue(response(data));

    await expect(login("user@example.com", "secret")).resolves.toEqual(data);
    expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "secret" }),
    });
  });

  it("uses the server detail or a default message for failed login", async () => {
    fetch
      .mockResolvedValueOnce(response({ detail: "Cuenta bloqueada" }, { ok: false, status: 401 }))
      .mockResolvedValueOnce(response({}, { ok: false, status: 401 }));

    await expect(login("user@example.com", "bad")).rejects.toThrow("Cuenta bloqueada");
    await expect(login("user@example.com", "bad")).rejects.toThrow(
      "Correo electrónico o contraseña incorrectos."
    );
  });
});

describe("registrar", () => {
  const datos = { nombre: "Lucia", apellido: "Gomez", email: "lucia@example.com", telefono: "099123456", password: "secreto123" };

  it("posts the data with name and surname joined, the phone, and returns the token", async () => {
    const data = { access_token: "token", token_type: "bearer" };
    fetch.mockResolvedValue(response(data, { status: 201 }));

    await expect(registrar(datos)).resolves.toEqual(data);
    expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Lucia Gomez",
        email: "lucia@example.com",
        phone: "099123456",
        password: "secreto123",
      }),
    });
  });

  it("surfaces the 409 message, and a generic one for 422 lists or other errors", async () => {
    fetch
      .mockResolvedValueOnce(response({ detail: "El correo ya está en uso." }, { ok: false, status: 409 }))
      .mockResolvedValueOnce(response({ detail: [{ msg: "x" }] }, { ok: false, status: 422 }))
      .mockResolvedValueOnce(response({}, { ok: false, status: 500 }));

    await expect(registrar(datos)).rejects.toThrow("El correo ya está en uso.");
    await expect(registrar(datos)).rejects.toThrow("Revisá los datos ingresados.");
    await expect(registrar(datos)).rejects.toThrow("No pudimos crear tu cuenta. Intentá de nuevo.");
  });

  it("translates a network failure", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(registrar(datos)).rejects.toThrow("No pudimos conectar con el servidor.");
  });
});

describe("obtenerPerfil", () => {
  it("sends the given token and maps the profile to the session shape", async () => {
    fetch.mockResolvedValue(
      response({ user_id: 7, name: "Lucia Gomez", email: "lucia@example.com", phone: "+59899123456" })
    );

    await expect(obtenerPerfil("tok")).resolves.toEqual({
      nombre: "Lucia Gomez",
      apellido: "",
      email: "lucia@example.com",
      telefono: "099 123 456",
    });
    expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: "Bearer tok" },
    });
  });

  it("maps a missing phone to an empty string", async () => {
    fetch.mockResolvedValue(response({ user_id: 7, name: "Ana", email: "a@b.com", phone: null }));

    await expect(obtenerPerfil("tok")).resolves.toEqual(expect.objectContaining({ telefono: "" }));
  });

  it("fails on error statuses, broken bodies and network errors", async () => {
    fetch
      .mockResolvedValueOnce(response({ detail: "x" }, { ok: false, status: 401 }))
      .mockResolvedValueOnce(response(null, { jsonError: new Error("bad json") }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(obtenerPerfil("tok")).rejects.toThrow("No pudimos cargar tu perfil.");
    await expect(obtenerPerfil("tok")).rejects.toThrow("No pudimos cargar tu perfil.");
    await expect(obtenerPerfil("tok")).rejects.toThrow("No pudimos conectar con el servidor.");
  });
});

describe("actualizarPerfil", () => {
  it("sends name and phone with the session token and maps the response", async () => {
    fetch.mockResolvedValue(
      response({ user_id: 7, name: "Lucia Perez", email: "lucia@example.com", phone: "+59898765432" })
    );

    await expect(
      actualizarPerfil({ nombre: "Lucia", apellido: "Perez", telefono: "098 765 432" })
    ).resolves.toEqual({
      nombre: "Lucia Perez",
      apellido: "",
      email: "lucia@example.com",
      telefono: "098 765 432",
    });
    expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/api/v1/auth/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer jwt-token" },
      body: JSON.stringify({ name: "Lucia Perez", phone: "098 765 432" }),
    });
  });

  it("sends a null phone when it is empty", async () => {
    fetch.mockResolvedValue(response({ user_id: 7, name: "Ana", email: "a@b.com", phone: null }));

    await actualizarPerfil({ nombre: "Ana", apellido: "", telefono: "" });

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ name: "Ana", phone: null });
  });

  it("maps error statuses, broken bodies and network errors to messages", async () => {
    fetch
      .mockResolvedValueOnce(response({ detail: "x" }, { ok: false, status: 401 }))
      .mockResolvedValueOnce(response({ detail: [] }, { ok: false, status: 422 }))
      .mockResolvedValueOnce(response(null, { jsonError: new Error("bad json") }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const datos = { nombre: "Ana", apellido: "", telefono: "" };
    await expect(actualizarPerfil(datos)).rejects.toThrow("Tu sesión venció. Iniciá sesión de nuevo.");
    await expect(actualizarPerfil(datos)).rejects.toThrow("Revisá el nombre y el teléfono (ej: 099 123 456).");
    await expect(actualizarPerfil(datos)).rejects.toThrow("No pudimos guardar tus datos.");
    await expect(actualizarPerfil(datos)).rejects.toThrow("No pudimos conectar con el servidor.");
  });
});

describe("cambiarPassword", () => {
  it("sends both passwords with the session token", async () => {
    fetch.mockResolvedValue({ ok: true, status: 204, json: jest.fn() });

    await expect(cambiarPassword("secreto123", "nueva-clave-1")).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/api/v1/auth/me/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer jwt-token" },
      body: JSON.stringify({ current_password: "secreto123", new_password: "nueva-clave-1" }),
    });
  });

  it("maps error statuses, broken bodies and network errors to messages", async () => {
    fetch
      .mockResolvedValueOnce(response({ detail: "La contraseña actual es incorrecta." }, { ok: false, status: 400 }))
      .mockResolvedValueOnce(response({ detail: "x" }, { ok: false, status: 401 }))
      .mockResolvedValueOnce(response({ detail: [] }, { ok: false, status: 422 }))
      .mockResolvedValueOnce(response(null, { ok: false, status: 500, jsonError: new Error("bad json") }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(cambiarPassword("a", "b")).rejects.toThrow("La contraseña actual es incorrecta.");
    await expect(cambiarPassword("a", "b")).rejects.toThrow("Tu sesión venció. Iniciá sesión de nuevo.");
    await expect(cambiarPassword("a", "b")).rejects.toThrow("La nueva contraseña tiene que tener entre 8 caracteres y 72 bytes.");
    await expect(cambiarPassword("a", "b")).rejects.toThrow("No pudimos cambiar tu contraseña.");
    await expect(cambiarPassword("a", "b")).rejects.toThrow("No pudimos conectar con el servidor.");
  });
});

describe("catalog API", () => {
  it("requests all parts or combines and encodes the supported filters", async () => {
    fetch.mockResolvedValue(response({ parts: [backendPart] }));

    await expect(obtenerRepuestos()).resolves.toEqual([uiPart]);
    expect(fetch).toHaveBeenNthCalledWith(1, `${BASE_URL}/api/v1/parts`);

    await obtenerRepuestos({
      categoria: "Frenos y filtros",
      brand: "Volkswagen & Audi",
      model: "Golf GTI",
      year: 2024,
    });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/api/v1/parts?categoria=Frenos+y+filtros&brand=Volkswagen+%26+Audi&model=Golf+GTI&year=2024`
    );
  });

  it("continues to accept a category string and maps categories", async () => {
    fetch
      .mockResolvedValueOnce(response({ parts: [backendPart] }))
      .mockResolvedValueOnce(response({ categories: [{ name: "Frenos", count: 3 }] }));

    await expect(obtenerRepuestos("Frenos")).resolves.toEqual([uiPart]);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `${BASE_URL}/api/v1/parts?categoria=Frenos`
    );
    await expect(obtenerCategorias()).resolves.toEqual([
      { nombre: "Frenos", cantidad: 3 },
    ]);
  });

  it("reports network, HTTP, invalid JSON, and malformed list failures", async () => {
    fetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(response({ detail: "Backend en mantenimiento" }, { ok: false, status: 503 }))
      .mockResolvedValueOnce(response(null, { jsonError: new SyntaxError("invalid JSON") }))
      .mockResolvedValueOnce(response({}));

    await expect(obtenerRepuestos()).rejects.toThrow("No pudimos cargar los repuestos.");
    await expect(obtenerRepuestos()).rejects.toThrow("Backend en mantenimiento");
    await expect(obtenerRepuestos()).rejects.toThrow("No pudimos cargar los repuestos.");
    await expect(obtenerRepuestos()).rejects.toThrow("No pudimos cargar los repuestos.");
  });

  it("maps brands and URL-encodes the requested brand for models", async () => {
    fetch
      .mockResolvedValueOnce(response({ brands: [{ brand: "Volkswagen" }] }))
      .mockResolvedValueOnce(response({ models: [{ model: "Golf" }] }));

    await expect(obtenerMarcas()).resolves.toEqual([{ brand: "Volkswagen" }]);
    await expect(obtenerModelos("VW & Audi")).resolves.toEqual([{ model: "Golf" }]);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/api/v1/models?brand=VW%20%26%20Audi`
    );
  });
});

describe("cart API", () => {
  const backendCart = {
    items: [{
      part_id: 21,
      name: "Disco de freno",
      price: 2450,
      amount: 2,
      subtotal: 4900,
      stock: 7,
      category: "Frenos",
    }],
    total: 4900,
  };
  const uiCart = {
    items: [{
      id: "21",
      partId: 21,
      nombre: "Disco de freno",
      precio: 2450,
      cantidad: 2,
      subtotal: 4900,
      stock: 7,
      categoria: "Frenos",
      imagen: IMAGEN_PLACEHOLDER,
    }],
    total: 4900,
  };

  it("sends authenticated GET/POST/PATCH/DELETE operations and maps each cart", async () => {
    fetch.mockResolvedValue(response(backendCart));

    await expect(obtenerCarrito()).resolves.toEqual(uiCart);
    await expect(agregarItemCarrito(21, 2)).resolves.toEqual(uiCart);
    await expect(actualizarItemCarrito(21, 2)).resolves.toEqual(uiCart);
    await expect(eliminarItemCarrito(21)).resolves.toEqual(uiCart);
    await expect(vaciarCarritoAPI()).resolves.toEqual(uiCart);

    expect(fetch).toHaveBeenNthCalledWith(1, `${BASE_URL}/api/v1/cart`, {
      headers: { "Content-Type": "application/json", Authorization: "Bearer jwt-token" },
    });
    expect(fetch).toHaveBeenNthCalledWith(2, `${BASE_URL}/api/v1/cart/items`, {
      method: "POST",
      body: JSON.stringify({ part_id: 21, amount: 2 }),
      headers: { "Content-Type": "application/json", Authorization: "Bearer jwt-token" },
    });
    expect(fetch).toHaveBeenNthCalledWith(3, `${BASE_URL}/api/v1/cart/items/21`, {
      method: "PATCH",
      body: JSON.stringify({ amount: 2 }),
      headers: { "Content-Type": "application/json", Authorization: "Bearer jwt-token" },
    });
    expect(fetch).toHaveBeenNthCalledWith(4, `${BASE_URL}/api/v1/cart/items/21`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: "Bearer jwt-token" },
    });
    expect(fetch).toHaveBeenNthCalledWith(5, `${BASE_URL}/api/v1/cart`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: "Bearer jwt-token" },
    });
  });

  it("attaches an HTTP status to cart errors and provides a network error", async () => {
    fetch
      .mockResolvedValueOnce(response({}, { ok: false, status: 409 }))
      .mockResolvedValueOnce(response({ detail: "Stock actualizado" }, { ok: false, status: 409 }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(obtenerCarrito()).rejects.toMatchObject({
      message: "No hay stock suficiente.",
      status: 409,
    });
    await expect(obtenerCarrito()).rejects.toMatchObject({
      message: "Stock actualizado",
      status: 409,
    });
    await expect(obtenerCarrito()).rejects.toThrow("No pudimos conectar con el carrito.");
  });
});

describe("address API", () => {
  const backendAddress = {
    shipping_address_id: 4,
    personal_name: "Casa",
    street: "Av. Italia",
    number: "1234",
    apartment: null,
    city: "Montevideo",
    department: "Montevideo",
    postal_code: null,
    is_primary: true,
  };
  const uiAddress = {
    id: 4,
    nombre: "Casa",
    calle: "Av. Italia",
    numero: "1234",
    apartamento: "",
    ciudad: "Montevideo",
    departamento: "Montevideo",
    codigoPostal: "",
    principal: true,
  };

  it("maps addresses and submits create, primary, and delete requests", async () => {
    fetch
      .mockResolvedValueOnce(response([backendAddress]))
      .mockResolvedValueOnce(response(backendAddress))
      .mockResolvedValueOnce(response(backendAddress))
      .mockResolvedValueOnce(response(null, { status: 204 }));

    await expect(obtenerDirecciones()).resolves.toEqual([uiAddress]);
    await expect(crearDireccion({
      nombre: "Casa",
      calle: "Av. Italia",
      numero: "1234",
      apartamento: "",
      ciudad: "Montevideo",
      departamento: "Montevideo",
      codigoPostal: "",
      principal: true,
    })).resolves.toEqual(uiAddress);
    await expect(marcarDireccionPrincipal(4)).resolves.toEqual(uiAddress);
    await expect(eliminarDireccionAPI(4)).resolves.toBeUndefined();

    expect(fetch).toHaveBeenNthCalledWith(2, `${BASE_URL}/api/v1/addresses`, {
      method: "POST",
      body: JSON.stringify({
        personal_name: "Casa",
        street: "Av. Italia",
        number: "1234",
        apartment: null,
        city: "Montevideo",
        department: "Montevideo",
        postal_code: null,
        is_primary: true,
      }),
      headers: { "Content-Type": "application/json", Authorization: "Bearer jwt-token" },
    });
    expect(fetch).toHaveBeenNthCalledWith(3, `${BASE_URL}/api/v1/addresses/4/primary`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer jwt-token" },
    });
    expect(fetch).toHaveBeenNthCalledWith(4, `${BASE_URL}/api/v1/addresses/4`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: "Bearer jwt-token" },
    });
  });

  it("uses endpoint-specific errors for rejected requests", async () => {
    fetch.mockResolvedValue(response({}, { ok: false, status: 422 }));

    await expect(obtenerDirecciones()).rejects.toMatchObject({
      message: "Revisá los datos de la dirección.",
      status: 422,
    });
  });
});

describe("payment method API", () => {
  const backendMethod = {
    payment_method_id: 8,
    card_type: "Visa",
    holder: "Ana Pérez",
    last_four: "4242",
    expiry: "12/30",
    is_primary: true,
  };
  const uiMethod = {
    id: 8,
    tipo: "Visa",
    titular: "Ana Pérez",
    numero: "4242",
    vencimiento: "12/30",
    principal: true,
  };

  it("maps methods and only submits the final four card digits", async () => {
    fetch
      .mockResolvedValueOnce(response([backendMethod]))
      .mockResolvedValueOnce(response(backendMethod))
      .mockResolvedValueOnce(response(backendMethod))
      .mockResolvedValueOnce(response(null, { status: 204 }));

    await expect(obtenerMetodosPago()).resolves.toEqual([uiMethod]);
    await expect(crearMetodoPago({
      tipo: "Visa",
      titular: "Ana Pérez",
      numero: "4111 1111 1111 4242",
      vencimiento: "12/30",
      principal: true,
      cvv: "123",
    })).resolves.toEqual(uiMethod);
    await expect(marcarMetodoPagoPrincipal(8)).resolves.toEqual(uiMethod);
    await expect(eliminarMetodoPagoAPI(8)).resolves.toBeUndefined();

    expect(fetch).toHaveBeenNthCalledWith(2, `${BASE_URL}/api/v1/payment-methods`, {
      method: "POST",
      body: JSON.stringify({
        card_type: "Visa",
        holder: "Ana Pérez",
        last_four: "4242",
        expiry: "12/30",
        is_primary: true,
      }),
      headers: { "Content-Type": "application/json", Authorization: "Bearer jwt-token" },
    });
    expect(JSON.stringify(fetch.mock.calls[1][1].body)).not.toContain("123");
  });

  it("uses a payment-specific validation error", async () => {
    fetch.mockResolvedValue(response({}, { ok: false, status: 422 }));

    await expect(obtenerMetodosPago()).rejects.toMatchObject({
      message: "Revisá los datos de la tarjeta.",
      status: 422,
    });
  });
});

describe("recommendations API", () => {
  it("skips empty IDs and maps recommendations for valid IDs", async () => {
    fetch.mockResolvedValue(response({ parts: [backendPart] }));

    await expect(obtenerRecomendaciones([])).resolves.toEqual([]);
    await expect(obtenerRecomendaciones([null, undefined])).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();

    await expect(obtenerRecomendaciones([21, null, 32])).resolves.toEqual([uiPart]);
    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/recommendations?part_ids=21,32`
    );
  });

  it("returns an empty list if the optional recommendations service fails", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(obtenerRecomendaciones([21])).resolves.toEqual([]);
  });
});
