// Tests de las pantallas de «Mi cuenta».

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

jest.mock("./api", () => ({
  requestPasswordReset: jest.fn(),
  resetPassword: jest.fn(),
  verifyEmail: jest.fn(),
  resendVerification: jest.fn(),
  getProfile: jest.fn(),
}));
// La barra de navegación no es parte de estas pantallas (y necesita el
// contexto del carrito).
jest.mock("./Navbar", () => () => null);

import VerifyEmailNotice from "./VerifyEmailNotice";
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";
import VerifyEmail from "./VerifyEmail";
import {
  getProfile,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  verifyEmail,
} from "./api";

const INVALID_LINK = "El enlace no es válido o ya venció. Pedí uno nuevo.";

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
    render(<ForgotPassword onVolverAlLogin={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: "Enviar enlace" }));

    expect(screen.getByText("Ingresá tu correo electrónico.")).toBeInTheDocument();
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("pide el enlace y muestra el mismo mensaje exista o no el correo", async () => {
    const user = userEvent.setup();
    requestPasswordReset.mockResolvedValue(
      "Si el correo está registrado, te mandamos un enlace para elegir una contraseña nueva."
    );
    render(<ForgotPassword onVolverAlLogin={jest.fn()} />);

    await user.type(screen.getByLabelText("CORREO ELECTRÓNICO"), " ana@example.com ");
    await user.click(screen.getByRole("button", { name: "Enviar enlace" }));

    expect(requestPasswordReset).toHaveBeenCalledWith("ana@example.com");
    expect(await screen.findByRole("status")).toHaveTextContent("Si el correo está registrado");
    expect(screen.queryByRole("button", { name: "Enviar enlace" })).not.toBeInTheDocument();
  });

  it("muestra el error si no se pudo pedir y permite volver al login", async () => {
    const user = userEvent.setup();
    const onVolverAlLogin = jest.fn();
    requestPasswordReset.mockRejectedValue(new Error("No pudimos conectar con el servidor."));
    render(<ForgotPassword onVolverAlLogin={onVolverAlLogin} />);

    await user.type(screen.getByLabelText("CORREO ELECTRÓNICO"), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar enlace" }));
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
    enRuta(<ResetPassword {...p} />, "/restablecer-password", "/restablecer-password");

    expect(screen.getByRole("alert")).toHaveTextContent(INVALID_LINK);
    await user.click(screen.getByRole("button", { name: "Pedir otro enlace" }));
    expect(p.onPedirOtroEnlace).toHaveBeenCalled();
  });

  it("valida la contraseña nueva y que coincidan", async () => {
    const user = userEvent.setup();
    enRuta(<ResetPassword {...props()} />, "/restablecer-password?token=tok", "/restablecer-password");

    await user.type(screen.getByLabelText("NUEVA CONTRASEÑA"), "corta");
    await user.type(screen.getByLabelText("REPETIR NUEVA CONTRASEÑA"), "otra");
    await user.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(screen.getByText("La contraseña tiene que tener al menos 8 caracteres.")).toBeInTheDocument();
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("guarda la contraseña nueva con el token del enlace", async () => {
    const user = userEvent.setup();
    const p = props();
    resetPassword.mockResolvedValue();
    enRuta(<ResetPassword {...p} />, "/restablecer-password?token=tok-mail", "/restablecer-password");

    await user.type(screen.getByLabelText("NUEVA CONTRASEÑA"), "Nueva2026x");
    await user.type(screen.getByLabelText("REPETIR NUEVA CONTRASEÑA"), "Nueva2026x");
    await user.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(resetPassword).toHaveBeenCalledWith("tok-mail", "Nueva2026x");
    expect(await screen.findByRole("status")).toHaveTextContent("ya podés iniciar sesión");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(p.onIniciarSesion).toHaveBeenCalled();
  });

  it("si el enlace ya se usó o venció, deja de mostrar el formulario", async () => {
    const user = userEvent.setup();
    resetPassword.mockRejectedValue(errorConEstado(INVALID_LINK, 400));
    enRuta(<ResetPassword {...props()} />, "/restablecer-password?token=usado", "/restablecer-password");

    await user.type(screen.getByLabelText("NUEVA CONTRASEÑA"), "Nueva2026x");
    await user.type(screen.getByLabelText("REPETIR NUEVA CONTRASEÑA"), "Nueva2026x");
    await user.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(INVALID_LINK);
    expect(screen.queryByLabelText("NUEVA CONTRASEÑA")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pedir otro enlace" })).toBeInTheDocument();
  });

  it("si la contraseña no sirve, se puede corregir sin pedir otro enlace", async () => {
    const user = userEvent.setup();
    resetPassword.mockRejectedValue(errorConEstado("La contraseña no puede contener tu correo.", 422));
    enRuta(<ResetPassword {...props()} />, "/restablecer-password?token=tok", "/restablecer-password");

    await user.type(screen.getByLabelText("NUEVA CONTRASEÑA"), "lucia2026x");
    await user.type(screen.getByLabelText("REPETIR NUEVA CONTRASEÑA"), "lucia2026x");
    await user.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no puede contener tu correo");
    expect(screen.getByLabelText("NUEVA CONTRASEÑA")).toBeInTheDocument();
  });
});

describe("VerificarCorreo", () => {
  it("verifica con el token del enlace y avisa a la app", async () => {
    const user = userEvent.setup();
    const onVerificado = jest.fn();
    const onIrALaTienda = jest.fn();
    verifyEmail.mockResolvedValue();
    enRuta(
      <VerifyEmail onVerificado={onVerificado} onIrALaTienda={onIrALaTienda} />,
      "/verificar-correo?token=tok-mail",
      "/verificar-correo"
    );

    expect(screen.getByRole("status")).toHaveTextContent("Verificando tu correo...");
    expect(await screen.findByText(/Tu correo quedó verificado/)).toBeInTheDocument();
    expect(verifyEmail).toHaveBeenCalledTimes(1);
    expect(verifyEmail).toHaveBeenCalledWith("tok-mail");
    expect(onVerificado).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Ir a la tienda" }));
    expect(onIrALaTienda).toHaveBeenCalled();
  });

  it("muestra el error si el enlace no sirve", async () => {
    const onVerificado = jest.fn();
    verifyEmail.mockRejectedValue(errorConEstado(INVALID_LINK, 400));
    enRuta(
      <VerifyEmail onVerificado={onVerificado} onIrALaTienda={jest.fn()} />,
      "/verificar-correo?token=vencido",
      "/verificar-correo"
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(INVALID_LINK);
    expect(onVerificado).not.toHaveBeenCalled();
  });

  it("sin token no llama al backend", () => {
    enRuta(<VerifyEmail onIrALaTienda={jest.fn()} />, "/verificar-correo", "/verificar-correo");

    expect(screen.getByRole("alert")).toHaveTextContent(INVALID_LINK);
    expect(verifyEmail).not.toHaveBeenCalled();
  });
});

describe("AvisoVerificarCorreo", () => {
  const sinVerificar = { email: "ana@example.com", emailVerificado: false };

  it("solo aparece si el perfil dice que el correo no está verificado", () => {
    const { rerender } = render(<VerifyEmailNotice usuario={null} />);
    expect(screen.queryByText(/Verificá tu correo/)).not.toBeInTheDocument();

    rerender(<VerifyEmailNotice usuario={{ email: "ana@example.com", emailVerificado: true }} />);
    expect(screen.queryByText(/Verificá tu correo/)).not.toBeInTheDocument();

    rerender(<VerifyEmailNotice usuario={{ email: "ana@example.com" }} />);
    expect(screen.queryByText(/Verificá tu correo/)).not.toBeInTheDocument();

    rerender(<VerifyEmailNotice usuario={sinVerificar} />);
    expect(screen.getByText(/Verificá tu correo/)).toBeInTheDocument();
    expect(screen.getByText(/ana@example.com/)).toBeInTheDocument();
  });

  it("reenvía el mail", async () => {
    const user = userEvent.setup();
    resendVerification.mockResolvedValue();
    render(<VerifyEmailNotice usuario={sinVerificar} />);

    await user.click(screen.getByRole("button", { name: "Reenviar mail" }));

    expect(resendVerification).toHaveBeenCalled();
    expect(await screen.findByText("Listo, te lo reenviamos.")).toBeInTheDocument();
  });

  it("muestra el error y deja reintentar", async () => {
    const user = userEvent.setup();
    resendVerification.mockRejectedValue(new Error("No pudimos reenviar el mail."));
    render(<VerifyEmailNotice usuario={sinVerificar} />);

    await user.click(screen.getByRole("button", { name: "Reenviar mail" }));

    expect(await screen.findByText("No pudimos reenviar el mail.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reenviar mail" })).toBeEnabled()
    );
  });

  describe("con sesión", () => {
    const conToken = { ...sinVerificar, token: "tok" };

    beforeEach(() => {
      sessionStorage.clear();
    });

    it("al montar pregunta al backend y avisa si ya se verificó en otra pestaña", async () => {
      const onVerificado = jest.fn();
      getProfile.mockResolvedValue({ emailVerificado: true });
      render(<VerifyEmailNotice usuario={conToken} onVerificado={onVerificado} />);

      await waitFor(() => expect(onVerificado).toHaveBeenCalled());
      expect(getProfile).toHaveBeenCalledWith("tok");
    });

    it("vuelve a preguntar al volver a la pestaña", async () => {
      const onVerificado = jest.fn();
      getProfile.mockResolvedValue({ emailVerificado: false });
      render(<VerifyEmailNotice usuario={conToken} onVerificado={onVerificado} />);
      await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(1));

      getProfile.mockResolvedValue({ emailVerificado: true });
      window.dispatchEvent(new Event("focus"));

      await waitFor(() => expect(onVerificado).toHaveBeenCalled());
    });

    it("si otra pestaña guarda la sesión verificada, avisa sin ir al backend", async () => {
      const onVerificado = jest.fn();
      getProfile.mockResolvedValue({ emailVerificado: false });
      render(<VerifyEmailNotice usuario={conToken} onVerificado={onVerificado} />);
      await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(1));

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "autobought-sesion",
          newValue: JSON.stringify({ ...conToken, emailVerificado: true }),
        })
      );

      expect(onVerificado).toHaveBeenCalled();
      expect(getProfile).toHaveBeenCalledTimes(1);
    });

    it("no reenvía si el correo ya está verificado", async () => {
      const user = userEvent.setup();
      const onVerificado = jest.fn();
      getProfile.mockResolvedValueOnce({ emailVerificado: false });
      render(<VerifyEmailNotice usuario={conToken} onVerificado={onVerificado} />);
      await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(1));

      getProfile.mockResolvedValue({ emailVerificado: true });
      await user.click(screen.getByRole("button", { name: "Reenviar mail" }));

      await waitFor(() => expect(onVerificado).toHaveBeenCalled());
      expect(resendVerification).not.toHaveBeenCalled();
    });

    it("se puede cerrar", async () => {
      const user = userEvent.setup();
      getProfile.mockResolvedValue({ emailVerificado: false });
      render(<VerifyEmailNotice usuario={conToken} />);

      await user.click(screen.getByRole("button", { name: "Cerrar aviso" }));

      expect(screen.queryByText(/Verificá tu correo/)).not.toBeInTheDocument();
    });
  });
});
