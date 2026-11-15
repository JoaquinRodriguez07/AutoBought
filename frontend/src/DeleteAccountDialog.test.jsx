// Tests del diálogo de confirmación para borrar la cuenta.

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("./api", () => ({
  deleteAccount: jest.fn(),
}));

import DeleteAccountDialog from "./DeleteAccountDialog";
import { deleteAccount } from "./api";

describe("DeleteAccountDialog", () => {
  const props = () => ({
    onClose: jest.fn(),
    onDeleted: jest.fn(),
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("warns, requires a password, and allows toggling password visibility", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountDialog {...props()} />);

    expect(screen.getByText(
      "ATENCIÓN! Borrar tu cuenta es irreversible. Para confirmar, escribí tu contraseña abajo."
    )).toBeInTheDocument();
    const password = screen.getByLabelText("CONTRASEÑA");
    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Borrar Cuenta" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Ingresá tu contraseña.");
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("closes when cancelled or clicking outside the dialog", async () => {
    const user = userEvent.setup();
    const p = props();
    const { rerender } = render(<DeleteAccountDialog {...p} />);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(p.onClose).toHaveBeenCalledTimes(1);

    p.onClose.mockClear();
    rerender(<DeleteAccountDialog {...p} />);
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement);
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it("deletes with the entered password then closes the session", async () => {
    const user = userEvent.setup();
    const p = props();
    deleteAccount.mockResolvedValue();
    render(<DeleteAccountDialog {...p} />);

    await user.type(screen.getByLabelText("CONTRASEÑA"), "secreto123");
    await user.click(screen.getByRole("button", { name: "Borrar Cuenta" }));

    expect(deleteAccount).toHaveBeenCalledWith("secreto123");
    expect(p.onDeleted).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, "Contraseña equivocada."],
    [
      409,
      "Aún hay pedidos pendientes. Esperá a que se completen o cancelalos para poder borrar tu cuenta.",
    ],
  ])("shows the appropriate message for backend status %s", async (status, message) => {
    const user = userEvent.setup();
    deleteAccount.mockRejectedValue(Object.assign(new Error("backend detail"), { status }));
    render(<DeleteAccountDialog {...props()} />);

    await user.type(screen.getByLabelText("CONTRASEÑA"), "secreto123");
    await user.click(screen.getByRole("button", { name: "Borrar Cuenta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
