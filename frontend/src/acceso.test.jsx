import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Registro from "./Registro";
import { fuerzaPassword } from "./fuerzaPassword";

// Las pantallas de login y registro (el rediseño): el armado común y lo
// nuevo del registro. El resto de su comportamiento está en components.test.

jest.mock("./api", () => ({ registrar: jest.fn() }));
jest.mock("./Navbar", () => () => <nav aria-label="Navegación" />);

const renderRegistro = () => render(<Registro onLogin={jest.fn()} onRegistroExitoso={jest.fn()} />);

describe("Registro", () => {
  test("shows a field's error when leaving it, without waiting for submit", async () => {
    const user = userEvent.setup();
    renderRegistro();

    await user.type(screen.getByPlaceholderText("tu@email.com"), "no-es-un-correo");
    await user.tab();

    expect(screen.getByPlaceholderText("tu@email.com")).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById("error-email")).toBeInTheDocument();
  });

  test("doesn't complain about an empty field just for passing through it", async () => {
    const user = userEvent.setup();
    renderRegistro();

    await user.click(screen.getByPlaceholderText("Tu nombre"));
    await user.tab();

    expect(screen.queryByText("El nombre no puede estar vacío.")).not.toBeInTheDocument();
  });

  test("the error goes away when you fix the field", async () => {
    const user = userEvent.setup();
    renderRegistro();
    const confirmar = screen.getByPlaceholderText("Repetí tu contraseña");

    await user.type(screen.getByPlaceholderText("Mínimo 8 caracteres"), "Repuestos2026");
    await user.type(confirmar, "Otra");
    await user.tab();
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeInTheDocument();

    await user.type(confirmar, "x");
    expect(screen.queryByText("Las contraseñas no coinciden.")).not.toBeInTheDocument();
  });

  test("says how strong the password is while you type it", async () => {
    const user = userEvent.setup();
    renderRegistro();
    const password = screen.getByPlaceholderText("Mínimo 8 caracteres");

    expect(screen.getByText("Al menos 8 caracteres, con una letra y un número.")).toBeInTheDocument();
    await user.type(password, "abc");
    expect(screen.getByText("Muy débil")).toBeInTheDocument();
    await user.clear(password);
    await user.type(password, "Repuestos2026!");
    expect(screen.getByText("Muy buena")).toBeInTheDocument();
  });

  test("both passwords can be shown", async () => {
    const user = userEvent.setup();
    renderRegistro();

    const [mostrarPassword, mostrarConfirmar] = screen.getAllByRole("button", { name: "Mostrar contraseña" });
    await user.click(mostrarPassword);
    await user.click(mostrarConfirmar);

    expect(screen.getByPlaceholderText("Mínimo 8 caracteres")).toHaveAttribute("type", "text");
    expect(screen.getByPlaceholderText("Repetí tu contraseña")).toHaveAttribute("type", "text");
  });

  test("the labels point to their fields", () => {
    renderRegistro();

    expect(screen.getByLabelText("Correo electrónico")).toHaveAttribute("placeholder", "tu@email.com");
    expect(screen.getByLabelText("Teléfono")).toHaveAttribute("placeholder", "099 123 456");
  });
});

describe("fuerzaPassword", () => {
  test.each([
    ["", null],
    ["abc", "Muy débil"],
    ["abcdefgh", "Débil"],
    ["repuestos1", "Aceptable"],
    ["repuestos2026", "Buena"],
    ["Repuestos2026!", "Muy buena"],
  ])("%s → %s", (password, texto) => {
    expect(fuerzaPassword(password)?.texto ?? null).toBe(texto);
  });

  test("without the 8 characters it's never more than weak", () => {
    expect(fuerzaPassword("Ab1!")?.texto).toBe("Débil");
  });
});
