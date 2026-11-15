// El equipo de vendedores: alta y baja (solo administradores).

import { useState } from "react";
import { CircleCheckIcon, UserPlusIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { decodeToken } from "../auth";
import { EMAIL_PATTERN } from "../validations";
import { addSeller, removeSeller, getSellers } from "./dashboardApi";
import { FormField, DashboardDialog, QueryState, Panel, NoData } from "./pieces";
import { useQuery } from "./useQuery";

function validate({ displayName, email }) {
  const errors = {};
  if (displayName.trim().length < 2) errors.displayName = "Escribí el nombre del vendedor.";
  if (!EMAIL_PATTERN.test(email.trim())) errors.email = "Escribí un correo válido.";
  return errors;
}

// Sumar a alguien: con nombre y correo alcanza. La contraseña la elige él
// con el mail que le llega.
function AddForm({ onAdded }) {
  const [info, setData] = useState({ displayName: "", email: "" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const change = (field) => (event) => {
    setData((anteriores) => ({ ...anteriores, [field]: event.target.value }));
    setErrors((anteriores) => ({ ...anteriores, [field]: undefined }));
  };

  const save = async (event) => {
    event.preventDefault();
    const found = validate(info);
    setErrors(found);
    setError("");
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const newItem = await addSeller(info);
      setData({ displayName: "", email: "" });
      onAdded(newItem);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} noValidate aria-label="Agregar vendedor" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 sm:items-start">
        <FormField id="vendedor-nombre" label="Nombre" error={errors.displayName}>
          <Input
            id="vendedor-nombre"
            value={info.displayName}
            onChange={change("displayName")}
            aria-invalid={Boolean(errors.displayName)}
            autoComplete="off"
            className="h-10"
          />
        </FormField>
        <FormField id="vendedor-email" label="Correo" error={errors.email}>
          <Input
            id="vendedor-email"
            type="email"
            value={info.email}
            onChange={change("email")}
            aria-invalid={Boolean(errors.email)}
            autoComplete="off"
            className="h-10"
          />
        </FormField>
        <Button type="submit" disabled={saving} className="h-10 px-5 sm:mt-[22px] hover:bg-orange-600">
          <UserPlusIcon />
          {saving ? "Agregando…" : "Agregar"}
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

function ConfirmRemoval({ seller, onCancel, onConfirmada }) {
  const [error, setError] = useState("");
  const [deactivating, setRemovalGiving] = useState(false);

  const confirm = async () => {
    setRemovalGiving(true);
    setError("");
    try {
      await removeSeller(seller.id);
      onConfirmada(seller);
    } catch (failure) {
      setError(failure.message);
      setRemovalGiving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <strong>{seller.displayName}</strong> ({seller.email}) no va a poder entrar más al portal y se cierran las
        sesiones que tenga abiertas. Si vuelve, lo podés agregar de nuevo con el mismo correo.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={deactivating} className="h-10">
          Cancelar
        </Button>
        <Button variant="destructive" onClick={confirm} disabled={deactivating} className="h-10">
          {deactivating ? "Dando de baja…" : "Dar de baja"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Sección "Equipo" del portal (SCRUM-175), solo para administradores: los
 * vendedores que pueden entrar, sumar a alguien y dar de baja.
 */
export default function Team({ sessionUser }) {
  const queryState = useQuery(getSellers, "team");
  const [aviso, setNotice] = useState("");
  const [toDeactivate, setToDeactivate] = useState(null);
  const miId = Number(sessionUser?.token ? decodeToken(sessionUser.token)?.sub : Number.NaN);

  const onAdd = (newItem) => {
    setNotice(`Listo. Le mandamos un mail a ${newItem.email} para que elija su contraseña y entre al portal.`);
    queryState.reload();
  };

  const onGiveOfRemoval = (seller) => {
    setToDeactivate(null);
    setNotice(`${seller.displayName} ya no es parte del equipo.`);
    queryState.reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="Sumar un vendedor"
        id="titulo-sumar-vendedor"
        details="Le llega un mail para elegir su contraseña. Después entra con su correo, como vos."
      >
        <AddForm onAdded={onAdd} />
      </Panel>

      {aviso && (
        <Alert role="status" className="border-green-200 bg-green-50 text-green-800">
          <CircleCheckIcon />
          <AlertDescription className="text-green-800">{aviso}</AlertDescription>
        </Alert>
      )}

      <Panel title="Vendedores" id="titulo-vendedores" details="Los que hoy pueden entrar al portal.">
        <QueryState queryState={queryState}>
          {(sellers) =>
            sellers.length === 0 ? (
              <NoData>Todavía no hay vendedores.</NoData>
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
                    {sellers.map((seller) => {
                      const soyYo = seller.id === miId;
                      return (
                        <TableRow key={seller.id}>
                          <TableCell className="pl-4 sm:pl-5 font-medium">
                            {seller.displayName}
                            {soyYo && <span className="ml-2 text-xs text-muted-foreground">(vos)</span>}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{seller.email}</TableCell>
                          <TableCell>
                            {seller.isAdmin ? (
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
                                onClick={() => setToDeactivate(seller)}
                                aria-label={`Dar de baja a ${seller.displayName}`}
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
        </QueryState>
      </Panel>

      <DashboardDialog
        isOpen={toDeactivate !== null}
        onChange={(isOpen) => !isOpen && setToDeactivate(null)}
        title="¿Dar de baja a este vendedor?"
        ancho="sm:max-w-[460px]"
      >
        {toDeactivate && (
          <ConfirmRemoval seller={toDeactivate} onCancel={() => setToDeactivate(null)} onConfirmada={onGiveOfRemoval} />
        )}
      </DashboardDialog>
    </div>
  );
}
