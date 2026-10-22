import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

jest.mock("./api", () => ({
  darseDeBaja: jest.fn(),
  guardarPreferenciasMails: jest.fn(),
}));
// La barra de navegación no es parte de estas pantallas (y necesita el
// contexto del carrito).
jest.mock("./Navbar", () => () => null);

import BotonAvisoStock from "./BotonAvisoStock";
import DarseDeBaja from "./DarseDeBaja";
import PreferenciasMails from "./PreferenciasMails";
import { darseDeBaja, guardarPreferenciasMails } from "./api";

afterEach(() => {
  jest.clearAllMocks();
});

describe("BotonAvisoStock", () => {
  it("no aparece si hay stock o no hay quien maneje el aviso", () => {
    const { container, rerender } = render(
      <BotonAvisoStock producto={{ stock: 3 }} tieneAviso={false} onAlternarAviso={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();

    rerender(<BotonAvisoStock producto={{ stock: 0 }} tieneAviso={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("avisa a quien lo maneja con el repuesto", async () => {
    const user = userEvent.setup();
    const onAlternarAviso = jest.fn();
    const producto = { partId: 7, stock: 0 };
    render(<BotonAvisoStock producto={producto} tieneAviso={false} onAlternarAviso={onAlternarAviso} />);

    await user.click(screen.getByRole("button", { name: /Avisame cuando haya/ }));

    expect(onAlternarAviso).toHaveBeenCalledWith(producto);
  });
});

describe("PreferenciasMails", () => {
  const usuario = { nombre: "Ana", token: "tok", recibeOfertas: true };

  it("muestra la preferencia actual y la cambia", async () => {
    const user = userEvent.setup();
    const onActualizarUsuario = jest.fn();
    guardarPreferenciasMails.mockResolvedValue({ recibeOfertas: false });
    render(<PreferenciasMails usuario={usuario} onActualizarUsuario={onActualizarUsuario} />);

    const interruptor = screen.getByRole("switch", { name: /Ofertas y recordatorios por mail/ });
    expect(interruptor).toHaveAttribute("aria-checked", "true");

    await user.click(interruptor);

    expect(guardarPreferenciasMails).toHaveBeenCalledWith(false);
    expect(onActualizarUsuario).toHaveBeenCalledWith({ ...usuario, recibeOfertas: false });
  });

  it("si el perfil todavía no cargó, muestra que sí recibe", () => {
    render(<PreferenciasMails usuario={{ nombre: "Ana" }} />);

    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("muestra el error si no se pudo guardar", async () => {
    const user = userEvent.setup();
    const onActualizarUsuario = jest.fn();
    guardarPreferenciasMails.mockRejectedValue(new Error("No pudimos guardar tu preferencia."));
    render(<PreferenciasMails usuario={{ ...usuario, recibeOfertas: false }} onActualizarUsuario={onActualizarUsuario} />);

    await user.click(screen.getByRole("switch"));

    expect(guardarPreferenciasMails).toHaveBeenCalledWith(true);
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos guardar tu preferencia.");
    expect(onActualizarUsuario).not.toHaveBeenCalled();
  });
});

describe("DarseDeBaja", () => {
  const enRuta = (url, props = {}) =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/baja-mails" element={<DarseDeBaja onIrALaTienda={jest.fn()} {...props} />} />
        </Routes>
      </MemoryRouter>
    );

  it("da de baja con el token del enlace", async () => {
    const user = userEvent.setup();
    const onIrALaTienda = jest.fn();
    darseDeBaja.mockResolvedValue();
    enRuta("/baja-mails?token=tok-baja", { onIrALaTienda });

    expect(screen.getByRole("status")).toHaveTextContent("Procesando tu baja...");
    expect(await screen.findByText(/no te vamos a mandar más ofertas/)).toBeInTheDocument();
    expect(darseDeBaja).toHaveBeenCalledTimes(1);
    expect(darseDeBaja).toHaveBeenCalledWith("tok-baja");

    await user.click(screen.getByRole("button", { name: "IR A LA TIENDA" }));
    expect(onIrALaTienda).toHaveBeenCalled();
  });

  it("muestra el error si el enlace no sirve", async () => {
    darseDeBaja.mockRejectedValue(new Error("El enlace no es válido."));
    enRuta("/baja-mails?token=roto");

    expect(await screen.findByRole("alert")).toHaveTextContent("El enlace no es válido.");
  });

  it("sin token no llama al backend", () => {
    enRuta("/baja-mails");

    expect(screen.getByRole("alert")).toHaveTextContent("El enlace no es válido.");
    expect(darseDeBaja).not.toHaveBeenCalled();
  });
});
