import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("./api", () => ({
  eliminarCuenta: jest.fn(),
}));

import EliminarCuentaDialog from "./EliminarCuentaDialog";
import { eliminarCuenta } from "./api";

function DialogPrueba({ onDeleted = jest.fn() }) {
  const [open, setOpen] = useState(true);
  return (
    <EliminarCuentaDialog
      open={open}
      onOpenChange={setOpen}
      onDeleted={onDeleted}
    />
  );
}

beforeEach(() => {
  eliminarCuenta.mockReset();
});

describe("EliminarCuentaDialog", () => {
  it("warns, obscures the password by default, toggles visibility, and cancels", async () => {
    const user = userEvent.setup();
    render(<DialogPrueba />);

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "ATENCIÓN! Borrar tu cuenta es irreversible. Para confirmar, escribí tu contraseña abajo."
    );
    expect(screen.getByLabelText("CONTRASEÑA")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("CONTRASEÑA")).toHaveAttribute("placeholder", "••••••••");
    expect(screen.getByRole("button", { name: "Borrar Cuenta" })).toBeDisabled();

    await user.type(screen.getByLabelText("CONTRASEÑA"), "secreto123");
    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(screen.getByLabelText("CONTRASEÑA")).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(screen.getByLabelText("CONTRASEÑA")).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(eliminarCuenta).not.toHaveBeenCalled();
  });

  it("closes when the user clicks outside the dialog", async () => {
    const user = userEvent.setup();
    render(<DialogPrueba />);

    await user.click(document.querySelector('[data-slot="dialog-overlay"]'));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sends the entered password and calls the deletion callback on success", async () => {
    const user = userEvent.setup();
    const onDeleted = jest.fn();
    eliminarCuenta.mockResolvedValue();
    render(<DialogPrueba onDeleted={onDeleted} />);

    await user.type(screen.getByLabelText("CONTRASEÑA"), "secreto123");
    await user.click(screen.getByRole("button", { name: "Borrar Cuenta" }));

    expect(eliminarCuenta).toHaveBeenCalledWith("secreto123");
    expect(onDeleted).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    "Aún hay pedidos pendientes. Esperá a que se completen o cancelalos para poder borrar tu cuenta.",
    "Contraseña equivocada.",
  ])("shows deletion errors without closing the dialog", async (message) => {
    const user = userEvent.setup();
    eliminarCuenta.mockRejectedValue(new Error(message));
    render(<DialogPrueba />);

    await user.type(screen.getByLabelText("CONTRASEÑA"), "secreto123");
    await user.click(screen.getByRole("button", { name: "Borrar Cuenta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
