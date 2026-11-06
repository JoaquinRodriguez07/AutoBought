import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Perfil from "./Perfil";
import { actualizarPerfil, obtenerPerfil } from "./api";
import { useCart } from "./context/CartContext";
import { MENSAJE_TELEFONO } from "./telefono";

jest.mock("./api", () => ({ actualizarPerfil: jest.fn(), obtenerPerfil: jest.fn() }));
jest.mock("./context/CartContext", () => ({ useCart: jest.fn() }));

// El marco de la cuenta y sus otras secciones tienen sus propios tests.
jest.mock("./CuentaLayout", () => ({ children }) => <main>{children}</main>);
jest.mock("./CambiarPassword", () => () => null);
jest.mock("./PreferenciasMails", () => () => null);

const ana = { nombre: "Ana", apellido: "Pérez", email: "ana@test.com", telefono: "099123456" };

const abrirEdicion = (user) => user.click(screen.getByRole("button", { name: "EDITAR" }));
const campoNombre = () => screen.getByLabelText(/NOMBRE/);
const campoTelefono = () => screen.getByLabelText(/TEL[ÉE]FONO/);
const guardar = (user) => user.click(screen.getByRole("button", { name: /GUARDAR/i }));

beforeEach(() => {
  jest.clearAllMocks();
  useCart.mockReturnValue({ cantidadCarrito: 0 });
  obtenerPerfil.mockResolvedValue({});
});

describe("showing the profile", () => {
  it("joins the name and surname", () => {
    render(<Perfil usuario={ana} />);

    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
  });

  it("does not ask for the profile without a token", () => {
    render(<Perfil usuario={ana} />);

    expect(obtenerPerfil).not.toHaveBeenCalled();
  });

  it("says which data is missing instead of leaving it blank", () => {
    render(<Perfil usuario={{}} />);

    expect(screen.getAllByText("No especificado")).toHaveLength(3);
  });

  it("tolerates a name without surname and a surname without name", () => {
    const { rerender } = render(<Perfil usuario={{ apellido: "Pérez" }} />);
    expect(screen.getByText("Pérez")).toBeInTheDocument();

    rerender(<Perfil usuario={{ nombre: "Ana" }} />);
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  it.each([
    [true, "Verificado"],
    [false, "Sin verificar"],
  ])("labels an email with verification %s", (emailVerificado, texto) => {
    render(<Perfil usuario={{ ...ana, emailVerificado }} />);

    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  it("does not label an email when the verification is unknown", () => {
    render(<Perfil usuario={ana} />);

    expect(screen.queryByText("Verificado")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin verificar")).not.toBeInTheDocument();
  });

  it("counts favorites and cart items in plural", () => {
    useCart.mockReturnValue({ cantidadCarrito: 2 });

    render(<Perfil usuario={ana} />);

    expect(screen.getByText("0 productos guardados")).toBeInTheDocument();
    expect(screen.getByText("2 productos en tu carrito")).toBeInTheDocument();
  });

  it("counts favorites and cart items in singular", () => {
    useCart.mockReturnValue({ cantidadCarrito: 1 });

    render(<Perfil usuario={ana} cantidadFavoritos={1} />);

    expect(screen.getByText("1 producto guardado")).toBeInTheDocument();
    expect(screen.getByText("1 producto en tu carrito")).toBeInTheDocument();
  });
});

describe("refreshing the profile", () => {
  const conToken = { ...ana, token: "t" };

  it("brings the latest data of the account", async () => {
    const onActualizarUsuario = jest.fn();
    obtenerPerfil.mockResolvedValue({ telefono: "098000000" });

    render(<Perfil usuario={conToken} onActualizarUsuario={onActualizarUsuario} />);

    await waitFor(() =>
      expect(onActualizarUsuario).toHaveBeenCalledWith({ ...conToken, telefono: "098000000" })
    );
  });

  it("warns when the data could not be refreshed", async () => {
    obtenerPerfil.mockRejectedValue(new Error("x"));

    render(<Perfil usuario={conToken} />);

    expect(await screen.findByText(/No pudimos actualizar tus datos/)).toBeInTheDocument();
  });

  it("does not overwrite what the client started editing", async () => {
    const user = userEvent.setup();
    const onActualizarUsuario = jest.fn();
    let responder;
    obtenerPerfil.mockReturnValue(new Promise((resolve) => (responder = resolve)));

    render(<Perfil usuario={conToken} onActualizarUsuario={onActualizarUsuario} />);
    await abrirEdicion(user);
    await act(async () => responder({ telefono: "098000000" }));

    expect(onActualizarUsuario).not.toHaveBeenCalled();
  });

  it("ignores an answer that arrives after leaving the page", async () => {
    const onActualizarUsuario = jest.fn();
    let responder;
    obtenerPerfil.mockReturnValue(new Promise((resolve) => (responder = resolve)));

    const { unmount } = render(<Perfil usuario={conToken} onActualizarUsuario={onActualizarUsuario} />);
    unmount();
    await act(async () => responder({ telefono: "098000000" }));

    expect(onActualizarUsuario).not.toHaveBeenCalled();
  });
});

describe("editing the profile", () => {
  it("preloads the data and discards the changes on cancel", async () => {
    const user = userEvent.setup();
    render(<Perfil usuario={ana} />);

    await abrirEdicion(user);
    expect(campoNombre()).toHaveValue("Ana Pérez");
    await user.clear(campoNombre());
    await user.type(campoNombre(), "Otra Persona");
    await user.click(screen.getByRole("button", { name: /CANCELAR/i }));

    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(actualizarPerfil).not.toHaveBeenCalled();
  });

  it("does not let the phone be deleted", async () => {
    const user = userEvent.setup();
    render(<Perfil usuario={ana} />);

    await abrirEdicion(user);
    await user.clear(campoTelefono());
    await guardar(user);

    expect(screen.getByRole("alert")).toHaveTextContent("Ingresá tu teléfono.");
    expect(actualizarPerfil).not.toHaveBeenCalled();
  });

  it("rejects an invalid phone", async () => {
    const user = userEvent.setup();
    render(<Perfil usuario={ana} />);

    await abrirEdicion(user);
    await user.clear(campoTelefono());
    await user.type(campoTelefono(), "123");
    await guardar(user);

    expect(screen.getByRole("alert")).toHaveTextContent(MENSAJE_TELEFONO);
    expect(actualizarPerfil).not.toHaveBeenCalled();
  });

  it("shows the server error and stays in edit mode", async () => {
    const user = userEvent.setup();
    actualizarPerfil.mockRejectedValue(new Error("No pudimos guardar."));
    render(<Perfil usuario={ana} />);

    await abrirEdicion(user);
    await guardar(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos guardar.");
    expect(campoNombre()).toBeInTheDocument();
  });

  it("saves without a callback", async () => {
    const user = userEvent.setup();
    actualizarPerfil.mockResolvedValue({ nombre: "Ana" });
    render(<Perfil usuario={ana} />);

    await abrirEdicion(user);
    await guardar(user);

    await waitFor(() => expect(screen.queryByLabelText(/NOMBRE/)).not.toBeInTheDocument());
  });

  it("says the email is missing and cannot be changed", async () => {
    const user = userEvent.setup();
    render(<Perfil usuario={{ nombre: "Ana", telefono: "099123456" }} />);

    await abrirEdicion(user);

    expect(screen.getByText("No especificado")).toBeInTheDocument();
    expect(screen.getByText("El correo no se puede cambiar.")).toBeInTheDocument();
  });
});
