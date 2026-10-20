import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

jest.mock("./api", () => ({
  pedirRecuperacion: jest.fn(),
  restablecerPassword: jest.fn(),
  verificarCorreo: jest.fn(),
  reenviarVerificacion: jest.fn(),
}));
// La barra de navegación no es parte de estas pantallas (y necesita el
// contexto del carrito).
jest.mock("./Navbar", () => () => null);

import AvisoVerificarCorreo from "./AvisoVerificarCorreo";
import RecuperarPassword from "./RecuperarPassword";
import RestablecerPassword from "./RestablecerPassword";
import VerificarCorreo from "./VerificarCorreo";
import {
  pedirRecuperacion,
  reenviarVerificacion,
  restablecerPassword,
  verificarCorreo,
} from "./api";

const ENLACE_INVALIDO = "El enlace no es válido o ya venció. Pedí uno nuevo.";

function enRuta(elemento, url, ruta) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path={ruta} element={elemento} />
      </Routes>
    </MemoryRouter>
  );
}

function errorConEstado(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

afterEach(() => {
  jest.clearAllMocks();
});

describe("RecuperarPassword", () => {
  it("valida el correo antes de pedir el enlace", async () => {
    const user = userEvent.setup();
    render(<RecuperarPassword onVolverAlLogin={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: "ENVIAR ENLACE" }));

    expect(screen.getByText("Ingresá tu correo electrónico.")).toBeInTheDocument();
    expect(pedirRecuperacion).not.toHaveBeenCalled();
  });

  it("pide el enlace y muestra el mismo mensaje exista o no el correo", async () => {
    const user = userEvent.setup();
    pedirRecuperacion.mockResolvedValue(
      "Si el correo está registrado, te mandamos un enlace para elegir una contraseña nueva."
    );
    render(<RecuperarPassword onVolverAlLogin={jest.fn()} />);

    await user.type(screen.getByLabelText("CORREO ELECTRÓNICO"), " ana@example.com ");
    await user.click(screen.getByRole("button", { name: "ENVIAR ENLACE" }));

    expect(pedirRecuperacion).toHaveBeenCalledWith("ana@example.com");
    expect(await screen.findByRole("status")).toHaveTextContent("Si el correo está registrado");
    expect(screen.queryByRole("button", { name: "ENVIAR ENLACE" })).not.toBeInTheDocument();
  });

  it("muestra el error si no se pudo pedir y permite volver al login", async () => {
    const user = userEvent.setup();
    const onVolverAlLogin = jest.fn();
    pedirRecuperacion.mockRejectedValue(new Error("No pudimos conectar con el servidor."));
    render(<RecuperarPassword onVolverAlLogin={onVolverAlLogin} />);

    await user.type(screen.getByLabelText("CORREO ELECTRÓNICO"), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "ENVIAR ENLACE" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos conectar con el servidor.");

    await user.click(screen.getByRole("button", { name: "Volver a iniciar sesión" }));
    expect(onVolverAlLogin).toHaveBeenCalled();
  });
});

describe("RestablecerPassword", () => {
  const props = () => ({ onIniciarSesion: jest.fn(), onPedirOtroEnlace: jest.fn() });

  it("sin token en la URL ofrece pedir otro enlace", async () => {
    const user = userEvent.setup();
    const p = props();
    enRuta(<RestablecerPassword {...p} />, "/restablecer-password", "/restablecer-password");

    expect(screen.getByRole("alert")).toHaveTextContent(ENLACE_INVALIDO);
    await user.click(screen.getByRole("button", { name: "PEDIR OTRO ENLACE" }));
    expect(p.onPedirOtroEnlace).toHaveBeenCalled();
  });

  it("valida la contraseña nueva y que coincidan", async () => {
    const user = userEvent.setup();
    enRuta(<RestablecerPassword {...props()} />, "/restablecer-password?token=tok", "/restablecer-password");

    await user.type(screen.getByLabelText("NUEVA CONTRASEÑA"), "corta");
    await user.type(screen.getByLabelText("REPETIR NUEVA CONTRASEÑA"), "otra");
    await user.click(screen.getByRole("button", { name: "GUARDAR CONTRASEÑA" }));

    expect(screen.getByText("La contraseña tiene que tener al menos 8 caracteres.")).toBeInTheDocument();
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(restablecerPassword).not.toHaveBeenCalled();
  });

  it("guarda la contraseña nueva con el token del enlace", async () => {
    const user = userEvent.setup();
    const p = props();
    restablecerPassword.mockResolvedValue();
    enRuta(<RestablecerPassword {...p} />, "/restablecer-password?token=tok-mail", "/restablecer-password");

    await user.type(screen.getByLabelText("NUEVA CONTRASEÑA"), "Nueva2026x");
    await user.type(screen.getByLabelText("REPETIR NUEVA CONTRASEÑA"), "Nueva2026x");
    await user.click(screen.getByRole("button", { name: "GUARDAR CONTRASEÑA" }));

    expect(restablecerPassword).toHaveBeenCalledWith("tok-mail", "Nueva2026x");
    expect(await screen.findByRole("status")).toHaveTextContent("ya podés iniciar sesión");
    await user.click(screen.getByRole("button", { name: "INICIAR SESIÓN" }));
    expect(p.onIniciarSesion).toHaveBeenCalled();
  });

  it("si el enlace ya se usó o venció, deja de mostrar el formulario", async () => {
    const user = userEvent.setup();
    restablecerPassword.mockRejectedValue(errorConEstado(ENLACE_INVALIDO, 400));
    enRuta(<RestablecerPassword {...props()} />, "/restablecer-password?token=usado", "/restablecer-password");

    await user.type(screen.getByLabelText("NUEVA CONTRASEÑA"), "Nueva2026x");
    await user.type(screen.getByLabelText("REPETIR NUEVA CONTRASEÑA"), "Nueva2026x");
    await user.click(screen.getByRole("button", { name: "GUARDAR CONTRASEÑA" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ENLACE_INVALIDO);
    expect(screen.queryByLabelText("NUEVA CONTRASEÑA")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PEDIR OTRO ENLACE" })).toBeInTheDocument();
  });

  it("si la contraseña no sirve, se puede corregir sin pedir otro enlace", async () => {
    const user = userEvent.setup();
    restablecerPassword.mockRejectedValue(errorConEstado("La contraseña no puede contener tu correo.", 422));
    enRuta(<RestablecerPassword {...props()} />, "/restablecer-password?token=tok", "/restablecer-password");

    await user.type(screen.getByLabelText("NUEVA CONTRASEÑA"), "lucia2026x");
    await user.type(screen.getByLabelText("REPETIR NUEVA CONTRASEÑA"), "lucia2026x");
    await user.click(screen.getByRole("button", { name: "GUARDAR CONTRASEÑA" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no puede contener tu correo");
    expect(screen.getByLabelText("NUEVA CONTRASEÑA")).toBeInTheDocument();
  });
});

describe("VerificarCorreo", () => {
  it("verifica con el token del enlace y avisa a la app", async () => {
    const user = userEvent.setup();
    const onVerificado = jest.fn();
    const onIrALaTienda = jest.fn();
    verificarCorreo.mockResolvedValue();
    enRuta(
      <VerificarCorreo onVerificado={onVerificado} onIrALaTienda={onIrALaTienda} />,
      "/verificar-correo?token=tok-mail",
      "/verificar-correo"
    );

    expect(screen.getByRole("status")).toHaveTextContent("Verificando tu correo...");
    expect(await screen.findByText(/Tu correo quedó verificado/)).toBeInTheDocument();
    expect(verificarCorreo).toHaveBeenCalledTimes(1);
    expect(verificarCorreo).toHaveBeenCalledWith("tok-mail");
    expect(onVerificado).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "IR A LA TIENDA" }));
    expect(onIrALaTienda).toHaveBeenCalled();
  });

  it("muestra el error si el enlace no sirve", async () => {
    const onVerificado = jest.fn();
    verificarCorreo.mockRejectedValue(errorConEstado(ENLACE_INVALIDO, 400));
    enRuta(
      <VerificarCorreo onVerificado={onVerificado} onIrALaTienda={jest.fn()} />,
      "/verificar-correo?token=vencido",
      "/verificar-correo"
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(ENLACE_INVALIDO);
    expect(onVerificado).not.toHaveBeenCalled();
  });

  it("sin token no llama al backend", () => {
    enRuta(<VerificarCorreo onIrALaTienda={jest.fn()} />, "/verificar-correo", "/verificar-correo");

    expect(screen.getByRole("alert")).toHaveTextContent(ENLACE_INVALIDO);
    expect(verificarCorreo).not.toHaveBeenCalled();
  });
});

describe("AvisoVerificarCorreo", () => {
  const sinVerificar = { email: "ana@example.com", emailVerificado: false };

  it("solo aparece si el perfil dice que el correo no está verificado", () => {
    const { rerender } = render(<AvisoVerificarCorreo usuario={null} />);
    expect(screen.queryByText(/Verificá tu correo/)).not.toBeInTheDocument();

    rerender(<AvisoVerificarCorreo usuario={{ email: "ana@example.com", emailVerificado: true }} />);
    expect(screen.queryByText(/Verificá tu correo/)).not.toBeInTheDocument();

    rerender(<AvisoVerificarCorreo usuario={{ email: "ana@example.com" }} />);
    expect(screen.queryByText(/Verificá tu correo/)).not.toBeInTheDocument();

    rerender(<AvisoVerificarCorreo usuario={sinVerificar} />);
    expect(screen.getByText(/Verificá tu correo/)).toBeInTheDocument();
    expect(screen.getByText(/ana@example.com/)).toBeInTheDocument();
  });

  it("reenvía el mail", async () => {
    const user = userEvent.setup();
    reenviarVerificacion.mockResolvedValue();
    render(<AvisoVerificarCorreo usuario={sinVerificar} />);

    await user.click(screen.getByRole("button", { name: "REENVIAR MAIL" }));

    expect(reenviarVerificacion).toHaveBeenCalled();
    expect(await screen.findByText("Listo, te lo reenviamos.")).toBeInTheDocument();
  });

  it("muestra el error y deja reintentar", async () => {
    const user = userEvent.setup();
    reenviarVerificacion.mockRejectedValue(new Error("No pudimos reenviar el mail."));
    render(<AvisoVerificarCorreo usuario={sinVerificar} />);

    await user.click(screen.getByRole("button", { name: "REENVIAR MAIL" }));

    expect(await screen.findByText("No pudimos reenviar el mail.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "REENVIAR MAIL" })).toBeEnabled()
    );
  });
});
