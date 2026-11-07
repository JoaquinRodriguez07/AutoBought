// El equipo de vendedores: alta y baja (solo administradores).

import { useState } from "react";
import { CircleCheckIcon, UserPlusIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { decodeToken } from "../auth";
import { agregarVendedor, darDeBajaVendedor, obtenerVendedores } from "./apiDashboard";
import { Campo, Dialogo, EstadoConsulta, Panel, SinDatos } from "./piezas";
import { useConsulta } from "./useConsulta";

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validar({ nombre, email }) {
  const errores = {};
  if (nombre.trim().length < 2) errores.nombre = "Escribí el nombre del vendedor.";
  if (!CORREO.test(email.trim())) errores.email = "Escribí un correo válido.";
  return errores;
}

// Sumar a alguien: con nombre y correo alcanza. La contraseña la elige él
// con el mail que le llega.
function FormularioAlta({ onAgregado }) {
  const [datos, setDatos] = useState({ nombre: "", email: "" });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cambiar = (campo) => (event) => {
    setDatos((anteriores) => ({ ...anteriores, [campo]: event.target.value }));
    setErrores((anteriores) => ({ ...anteriores, [campo]: undefined }));
  };

  const guardar = async (event) => {
    event.preventDefault();
    const encontrados = validar(datos);
    setErrores(encontrados);
    setError("");
    if (Object.keys(encontrados).length > 0) return;

    setGuardando(true);
    try {
      const nuevo = await agregarVendedor(datos);
      setDatos({ nombre: "", email: "" });
      onAgregado(nuevo);
    } catch (falla) {
      setError(falla.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={guardar} noValidate aria-label="Agregar vendedor" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 sm:items-start">
        <Campo id="vendedor-nombre" etiqueta="Nombre" error={errores.nombre}>
          <Input
            id="vendedor-nombre"
            value={datos.nombre}
            onChange={cambiar("nombre")}
            aria-invalid={Boolean(errores.nombre)}
            autoComplete="off"
            className="h-10"
          />
        </Campo>
        <Campo id="vendedor-email" etiqueta="Correo" error={errores.email}>
          <Input
            id="vendedor-email"
            type="email"
            value={datos.email}
            onChange={cambiar("email")}
            aria-invalid={Boolean(errores.email)}
            autoComplete="off"
            className="h-10"
          />
        </Campo>
        <Button type="submit" disabled={guardando} className="h-10 px-5 sm:mt-[22px] hover:bg-orange-600">
          <UserPlusIcon />
          {guardando ? "Agregando…" : "Agregar"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

function ConfirmarBaja({ vendedor, onCancelar, onConfirmada }) {
  const [error, setError] = useState("");
  const [dandoDeBaja, setDandoDeBaja] = useState(false);

  const confirmar = async () => {
    setDandoDeBaja(true);
    setError("");
    try {
      await darDeBajaVendedor(vendedor.id);
      onConfirmada(vendedor);
    } catch (falla) {
      setError(falla.message);
      setDandoDeBaja(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <strong>{vendedor.nombre}</strong> ({vendedor.email}) no va a poder entrar más al portal y se cierran las
        sesiones que tenga abiertas. Si vuelve, lo podés agregar de nuevo con el mismo correo.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancelar} disabled={dandoDeBaja} className="h-10">
          Cancelar
        </Button>
        <Button variant="destructive" onClick={confirmar} disabled={dandoDeBaja} className="h-10">
          {dandoDeBaja ? "Dando de baja…" : "Dar de baja"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Sección "Equipo" del portal (SCRUM-175), solo para administradores: los
 * vendedores que pueden entrar, sumar a alguien y dar de baja.
 */
export default function Equipo({ usuario }) {
  const consulta = useConsulta(obtenerVendedores, "equipo");
  const [aviso, setAviso] = useState("");
  const [aDarDeBaja, setADarDeBaja] = useState(null);
  const miId = Number(usuario?.token ? decodeToken(usuario.token)?.sub : NaN);

  const alAgregar = (nuevo) => {
    setAviso(`Listo. Le mandamos un mail a ${nuevo.email} para que elija su contraseña y entre al portal.`);
    consulta.recargar();
  };

  const alDarDeBaja = (vendedor) => {
    setADarDeBaja(null);
    setAviso(`${vendedor.nombre} ya no es parte del equipo.`);
    consulta.recargar();
  };

  return (
    <div className="flex flex-col gap-6">
      <Panel
        titulo="Sumar un vendedor"
        id="titulo-sumar-vendedor"
        detalle="Le llega un mail para elegir su contraseña. Después entra con su correo, como vos."
      >
        <FormularioAlta onAgregado={alAgregar} />
      </Panel>

      {aviso && (
        <Alert role="status" className="border-green-200 bg-green-50 text-green-800">
          <CircleCheckIcon />
          <AlertDescription className="text-green-800">{aviso}</AlertDescription>
        </Alert>
      )}

      <Panel titulo="Vendedores" id="titulo-vendedores" detalle="Los que hoy pueden entrar al portal.">
        <EstadoConsulta consulta={consulta}>
          {(vendedores) =>
            vendedores.length === 0 ? (
              <SinDatos>Todavía no hay vendedores.</SinDatos>
            ) : (
              <div className="-mx-4 sm:-mx-5 overflow-x-auto">
                <Table aria-label="Vendedores del equipo">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4 sm:pl-5">Nombre</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead className="pr-4 sm:pr-5 text-right">
                        <span className="sr-only">Acciones</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendedores.map((vendedor) => {
                      const soyYo = vendedor.id === miId;
                      return (
                        <TableRow key={vendedor.id}>
                          <TableCell className="pl-4 sm:pl-5 font-medium">
                            {vendedor.nombre}
                            {soyYo && <span className="ml-2 text-xs text-muted-foreground">(vos)</span>}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{vendedor.email}</TableCell>
                          <TableCell>
                            {vendedor.esAdmin ? (
                              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-200">
                                Administrador
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Vendedor</span>
                            )}
                          </TableCell>
                          <TableCell className="pr-4 sm:pr-5 text-right">
                            {!soyYo && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setADarDeBaja(vendedor)}
                                aria-label={`Dar de baja a ${vendedor.nombre}`}
                                className="text-destructive hover:bg-red-50 hover:text-destructive"
                              >
                                Dar de baja
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )
          }
        </EstadoConsulta>
      </Panel>

      <Dialogo
        abierto={aDarDeBaja !== null}
        onCambiar={(abierto) => !abierto && setADarDeBaja(null)}
        titulo="¿Dar de baja a este vendedor?"
        ancho="sm:max-w-[460px]"
      >
        {aDarDeBaja && (
          <ConfirmarBaja vendedor={aDarDeBaja} onCancelar={() => setADarDeBaja(null)} onConfirmada={alDarDeBaja} />
        )}
      </Dialogo>
    </div>
  );
}
