import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Profile from "./Profile";
import { getProfile, updateProfile } from "./api";
import { PHONE_MESSAGE } from "./phone";

jest.mock("./api", () => ({ getProfile: jest.fn(), updateProfile: jest.fn() }));

// El marco de la cuenta tiene sus propios tests.
jest.mock("./AccountLayout", () => ({ children }) => <main>{children}</main>);

const ana = { displayName: "Ana", lastName: "Pérez", email: "ana@test.com", phone: "099123456" };

const abrirEdicion = (user) => user.click(screen.getByRole("button", { name: "Editar" }));
const campoNombre = () => screen.getByLabelText(/NOMBRE COMPLETO/);
const campoTelefono = () => screen.getByLabelText(/TELÉFONO/);
const guardar = (user) => user.click(screen.getByRole("button", { name: "Guardar cambios" }));

beforeEach(() => {
  jest.clearAllMocks();
  getProfile.mockResolvedValue({});
});

describe("showing the profile", () => {
  it("joins the name and surname", () => {
    render(<Profile sessionUser={ana} />);

    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
  });

  it("does not ask for the profile without a token", () => {
    render(<Profile sessionUser={ana} />);

    expect(getProfile).not.toHaveBeenCalled();
  });

  it("says which data is missing instead of leaving it blank", () => {
    render(<Profile sessionUser={{}} />);

    expect(screen.getAllByText("No especificado")).toHaveLength(3);
  });

  it("tolerates a name without surname and a surname without name", () => {
    const { rerender } = render(<Profile sessionUser={{ lastName: "Pérez" }} />);
    expect(screen.getByText("Pérez")).toBeInTheDocument();

    rerender(<Profile sessionUser={{ displayName: "Ana" }} />);
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  it.each([
    [true, "Verificado"],
    [false, "Sin verificar"],
  ])("labels an email with verification %s", (verifiedEmail, texto) => {
    render(<Profile sessionUser={{ ...ana, verifiedEmail }} />);

    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  it("does not label an email when the verification is unknown", () => {
    render(<Profile sessionUser={ana} />);

    expect(screen.queryByText("Verificado")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin verificar")).not.toBeInTheDocument();
  });
});

describe("refreshing the profile", () => {
  const conToken = { ...ana, token: "t" };

  it("brings the latest data of the account", async () => {
    const onUpdateUser = jest.fn();
    getProfile.mockResolvedValue({ phone: "098000000" });

    render(<Profile sessionUser={conToken} onUpdateUser={onUpdateUser} />);

    await waitFor(() => expect(onUpdateUser).toHaveBeenCalledWith({ ...conToken, phone: "098000000" }));
  });

  it("warns when the data could not be refreshed", async () => {
    getProfile.mockRejectedValue(new Error("x"));

    render(<Profile sessionUser={conToken} />);

    expect(await screen.findByText(/No pudimos actualizar tus datos/)).toBeInTheDocument();
  });

  it("does not overwrite what the client started editing", async () => {
    const user = userEvent.setup();
    const onUpdateUser = jest.fn();
    let responder;
    getProfile.mockReturnValue(new Promise((resolve) => (responder = resolve)));

    render(<Profile sessionUser={conToken} onUpdateUser={onUpdateUser} />);
    await abrirEdicion(user);
    await act(async () => responder({ phone: "098000000" }));

    expect(onUpdateUser).not.toHaveBeenCalled();
  });

  it("ignores an answer that arrives after leaving the page", async () => {
    const onUpdateUser = jest.fn();
    let responder;
    getProfile.mockReturnValue(new Promise((resolve) => (responder = resolve)));

    const { unmount } = render(<Profile sessionUser={conToken} onUpdateUser={onUpdateUser} />);
    unmount();
    await act(async () => responder({ phone: "098000000" }));

    expect(onUpdateUser).not.toHaveBeenCalled();
  });
});

describe("editing the profile", () => {
  it("preloads the data and discards the changes on cancel", async () => {
    const user = userEvent.setup();
    render(<Profile sessionUser={ana} />);

    await abrirEdicion(user);
    expect(campoNombre()).toHaveValue("Ana Pérez");
    await user.clear(campoNombre());
    await user.type(campoNombre(), "Otra Persona");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("does not let the phone be deleted", async () => {
    const user = userEvent.setup();
    render(<Profile sessionUser={ana} />);

    await abrirEdicion(user);
    await user.clear(campoTelefono());
    await guardar(user);

    expect(screen.getByRole("alert")).toHaveTextContent("Ingresá tu teléfono.");
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("rejects an invalid phone", async () => {
    const user = userEvent.setup();
    render(<Profile sessionUser={ana} />);

    await abrirEdicion(user);
    await user.clear(campoTelefono());
    await user.type(campoTelefono(), "123");
    await guardar(user);

    expect(screen.getByRole("alert")).toHaveTextContent(PHONE_MESSAGE);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("shows the server error and stays in edit mode", async () => {
    const user = userEvent.setup();
    updateProfile.mockRejectedValue(new Error("No pudimos guardar."));
    render(<Profile sessionUser={ana} />);

    await abrirEdicion(user);
    await guardar(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos guardar.");
    expect(campoNombre()).toBeInTheDocument();
  });

  it("saves and closes the form without a callback", async () => {
    const user = userEvent.setup();
    updateProfile.mockResolvedValue({ displayName: "Ana" });
    render(<Profile sessionUser={ana} />);

    await abrirEdicion(user);
    await guardar(user);

    await waitFor(() => expect(screen.queryByLabelText(/NOMBRE COMPLETO/)).not.toBeInTheDocument());
    expect(updateProfile).toHaveBeenCalledTimes(1);
    expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Ana Pérez", phone: "099123456" }));
  });

  it("says the email is missing and cannot be changed", async () => {
    const user = userEvent.setup();
    render(<Profile sessionUser={{ displayName: "Ana", phone: "099123456" }} />);

    await abrirEdicion(user);

    expect(screen.getByText("No especificado")).toBeInTheDocument();
    expect(screen.getByText("El correo no se puede cambiar.")).toBeInTheDocument();
  });
});
