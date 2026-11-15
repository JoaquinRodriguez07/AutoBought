// Tests del equipo de vendedores.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("./dashboardApi");

import Team from "./Team";
import { addSeller, removeSeller, getSellers } from "./dashboardApi";

// El admin (id 1) y un vendedor. El portal solo lee el payload del token.
const admin = {
  email: "admin@example.com",
  userType: "employee",
  token: `x.${btoa(JSON.stringify({ sub: "1", user_type: "employee", admin: true }))}.y`,
};

const team = [
  { id: 1, displayName: "Ana Admin", email: "admin@example.com", isAdmin: true },
  { id: 2, displayName: "Beto Vendedor", email: "beto@example.com", isAdmin: false },
];

const table = () => screen.findByRole("table", { name: "Vendedores del equipo" });

beforeEach(() => {
  jest.clearAllMocks();
  getSellers.mockResolvedValue(team);
});

describe("Equipo", () => {
  test("lists the sellers with their role, and marks you", async () => {
    render(<Team sessionUser={admin} />);

    const rows = within(await table()).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Ana Admin(vos)");
    expect(rows[0]).toHaveTextContent("Administrador");
    expect(rows[1]).toHaveTextContent("Beto Vendedor");
    expect(rows[1]).toHaveTextContent("Vendedor");
  });

  test("you can't drop yourself, only the others", async () => {
    render(<Team sessionUser={admin} />);
    await table();

    expect(screen.queryByRole("button", { name: "Dar de baja a Ana Admin" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dar de baja a Beto Vendedor" })).toBeInTheDocument();
  });

  test("adds a seller and says the mail was sent", async () => {
    const user = userEvent.setup();
    addSeller.mockResolvedValue({ id: 3, displayName: "Caro Nueva", email: "caro@example.com", isAdmin: false });
    render(<Team sessionUser={admin} />);
    await table();

    await user.type(screen.getByLabelText("Nombre"), "Caro Nueva");
    await user.type(screen.getByLabelText("Correo"), "caro@example.com");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(addSeller).toHaveBeenCalledWith({ displayName: "Caro Nueva", email: "caro@example.com" });
    expect(await screen.findByRole("status")).toHaveTextContent("Le mandamos un mail a caro@example.com");
    expect(screen.getByLabelText("Nombre")).toHaveValue("");
    await waitFor(() => expect(getSellers).toHaveBeenCalledTimes(2));
  });

  test("checks the name and the mail before sending", async () => {
    const user = userEvent.setup();
    render(<Team sessionUser={admin} />);
    await table();

    await user.type(screen.getByLabelText("Correo"), "no-es-un-correo");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(screen.getByText("Escribí el nombre del vendedor.")).toBeInTheDocument();
    expect(screen.getByText("Escribí un correo válido.")).toBeInTheDocument();
    expect(addSeller).not.toHaveBeenCalled();
  });

  test("shows the error if the mail is already used", async () => {
    const user = userEvent.setup();
    addSeller.mockRejectedValue(new Error("Ya hay una cuenta con ese correo."));
    render(<Team sessionUser={admin} />);
    await table();

    await user.type(screen.getByLabelText("Nombre"), "Beto Otra Vez");
    await user.type(screen.getByLabelText("Correo"), "beto@example.com");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya hay una cuenta con ese correo.");
    expect(screen.getByLabelText("Nombre")).toHaveValue("Beto Otra Vez");
  });

  test("drops a seller after confirming", async () => {
    const user = userEvent.setup();
    removeSeller.mockResolvedValue(undefined);
    render(<Team sessionUser={admin} />);
    await table();

    await user.click(screen.getByRole("button", { name: "Dar de baja a Beto Vendedor" }));
    const dialogo = await screen.findByRole("dialog", { name: "¿Dar de baja a este vendedor?" });
    expect(dialogo).toHaveTextContent("Beto Vendedor (beto@example.com) no va a poder entrar más");
    getSellers.mockResolvedValue([team[0]]);
    await user.click(within(dialogo).getByRole("button", { name: "Dar de baja" }));

    expect(removeSeller).toHaveBeenCalledWith(2);
    expect(await screen.findByRole("status")).toHaveTextContent("Beto Vendedor ya no es parte del equipo.");
    await waitFor(() => expect(screen.queryByText("beto@example.com")).not.toBeInTheDocument());
  });

  test("cancelling doesn't drop anyone", async () => {
    const user = userEvent.setup();
    render(<Team sessionUser={admin} />);
    await table();

    await user.click(screen.getByRole("button", { name: "Dar de baja a Beto Vendedor" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar" }));

    expect(removeSeller).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  test("shows the error if the drop fails", async () => {
    const user = userEvent.setup();
    removeSeller.mockRejectedValue(new Error("No pudimos dar de baja al vendedor."));
    render(<Team sessionUser={admin} />);
    await table();

    await user.click(screen.getByRole("button", { name: "Dar de baja a Beto Vendedor" }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Dar de baja" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("No pudimos dar de baja al vendedor.");
  });

  test("shows the error if the team can't be loaded", async () => {
    getSellers.mockRejectedValue(new Error("Esta acción requiere ser administrador."));
    render(<Team sessionUser={admin} />);

    expect(await screen.findByText("Esta acción requiere ser administrador.")).toBeInTheDocument();
  });
});
