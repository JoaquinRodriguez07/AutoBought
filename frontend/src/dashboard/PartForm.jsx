// Formulario de alta y edición de un repuesto.

import { useEffect, useState } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createPart, updatePart, getPartForEdit, getVehicles } from "./dashboardApi";
import { FormField, DashboardDialog } from "./pieces";

const EMPTY = {
  code: "",
  displayName: "",
  fabricante: "",
  categoria: "",
  price: "",
  stock: "0",
  color: "",
  monthsWarranty: "",
  description: "",
  compatibilidades: [],
};

const CURRENT_YEAR = new Date().getFullYear();

const vehicleName = (v) => [v.marca, v.modelo, v.engine].filter(Boolean).join(" ");

const isInteger = (texto) => /^\d+$/.test(String(texto).trim());

function validate(info, isSignup) {
  const errors = {};
  if (!info.code.trim()) errors.code = "Ingresá el código.";
  if (!info.displayName.trim()) errors.displayName = "Ingresá el nombre.";
  if (!info.fabricante.trim()) errors.fabricante = "Ingresá el fabricante.";
  if (!info.categoria.trim()) errors.categoria = "Ingresá la categoría.";
  if (!isInteger(info.price) || Number(info.price) <= 0) errors.price = "El precio es un número entero mayor que 0.";
  if (isSignup && !isInteger(info.stock)) errors.stock = "El stock es un número entero, 0 o más.";
  if (info.monthsWarranty !== "" && !isInteger(info.monthsWarranty)) errors.monthsWarranty = "Meses enteros, o vacío.";
  if (info.compatibilidades.length === 0) errors.compatibilidades = "Agregá al menos un vehículo compatible.";
  return errors;
}

// Selector de un vehículo compatible con su rango de años.
function AddVehicle({ vehicles, chosen, onAdd }) {
  const [idVehicle, setIdVehicle] = useState("");
  const [from, setFrom] = useState(String(CURRENT_YEAR - 10));
  const [until, setUntil] = useState(String(CURRENT_YEAR));
  const [error, setError] = useState("");

  const byBrand = {};
  vehicles.forEach((v) => {
    if (!chosen.includes(v.id)) (byBrand[v.marca] ||= []).push(v);
  });

  const add = () => {
    if (!idVehicle) return setError("Elegí un vehículo.");
    if (!isInteger(from) || !isInteger(until) || Number(until) < Number(from)) {
      return setError("Revisá los años: el año hasta no puede ser anterior al desde.");
    }
    setError("");
    onAdd({ idVehicle: Number(idVehicle), from: Number(from), until: Number(until) });
    setIdVehicle("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_5rem_5rem_auto] gap-2 items-end">
        <FormField id="vehicle" label="Vehículo">
          <NativeSelect id="vehicle" value={idVehicle} onChange={(e) => setIdVehicle(e.target.value)} className="w-full *:h-10">
            <NativeSelectOption value="">Elegí un vehículo</NativeSelectOption>
            {Object.entries(byBrand).map(([marca, list]) => (
              <NativeSelectOptGroup key={marca} label={marca}>
                {list.map((v) => (
                  <NativeSelectOption key={v.id} value={v.id}>
                    {vehicleName(v)}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="vehiculo-desde" label="Desde">
          <Input id="vehiculo-desde" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10" />
        </FormField>
        <FormField id="vehiculo-hasta" label="Hasta">
          <Input id="vehiculo-hasta" inputMode="numeric" value={until} onChange={(e) => setUntil(e.target.value)} className="h-10" />
        </FormField>
        <Button type="button" onClick={add} variant="secondary" className="h-10 px-3 text-xs">
          Agregar
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function FormContent({ idPart, categories, onSaved }) {
  const isSignup = idPart == null;
  const [info, setData] = useState(EMPTY);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [errorServer, setErrorServer] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let vigente = true;
    Promise.all([getVehicles(), isSignup ? null : getPartForEdit(idPart)])
      .then(([list, part]) => {
        if (!vigente) return;
        setVehicles(list);
        if (part) {
          // /parts/{id} trae los vehículos por nombre: se buscan sus ids.
          const compatibilidades = part.compatibilidades
            .map((c) => {
              const vehicle = list.find((v) => v.marca === c.marca && v.modelo === c.modelo && v.engine === c.engine);
              return vehicle && { idVehicle: vehicle.id, from: c.from, until: c.until };
            })
            .filter(Boolean);
          setData({
            ...EMPTY,
            ...part,
            price: String(part.price),
            monthsWarranty: String(part.monthsWarranty),
            compatibilidades,
          });
        }
        setLoading(false);
      })
      .catch((error) => {
        if (!vigente) return;
        setErrorServer(error.message);
        setLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [isSignup, idPart]);

  const change = (field) => (event) => setData((current) => ({ ...current, [field]: event.target.value }));

  const save = async (event) => {
    event.preventDefault();
    const found = validate(info, isSignup);
    setErrors(found);
    setErrorServer("");
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      const saved = isSignup ? await createPart(info) : await updatePart(idPart, info);
      onSaved(saved);
    } catch (error) {
      setErrorServer(error.message);
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const texto = (field, label, props = {}) => (
    <FormField id={`repuesto-${field}`} label={label} error={errors[field]}>
      <Input
        id={`repuesto-${field}`}
        value={info[field]}
        onChange={change(field)}
        aria-invalid={Boolean(errors[field])}
        aria-describedby={errors[field] ? `repuesto-${field}-error` : undefined}
        className="h-10"
        {...props}
      />
    </FormField>
  );

  const vehicleById = Object.fromEntries(vehicles.map((v) => [v.id, v]));

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4">
      <div className="grid sm:grid-cols-2 gap-3">
        {texto("code", "Código", { placeholder: "FRE-0101" })}
        {texto("displayName", "Nombre")}
        {texto("fabricante", "Fabricante")}
        {texto("categoria", "Categoría", { list: "categorias-repuesto" })}
        {texto("price", "Precio ($)", { inputMode: "numeric" })}
        {isSignup && texto("stock", "Stock inicial", { inputMode: "numeric" })}
        {texto("color", "Color (opcional)")}
        {texto("monthsWarranty", "Garantía en meses (opcional)", { inputMode: "numeric" })}
      </div>
      <datalist id="categorias-repuesto">
        {categories.map((displayName) => (
          <option key={displayName} value={displayName} />
        ))}
      </datalist>

      <FormField id="repuesto-descripcion" label="Descripción (opcional)">
        <Textarea id="repuesto-descripcion" rows={3} value={info.description} onChange={change("description")} />
      </FormField>

      <FieldSet className="border rounded-lg p-3 gap-3">
        <FieldLegend variant="label" className="px-1 text-xs font-bold">
          Vehículos compatibles
        </FieldLegend>
        {info.compatibilidades.length > 0 && (
          <ul aria-label="Vehículos elegidos" className="flex flex-col gap-1 mb-3">
            {info.compatibilidades.map((c) => (
              <li key={c.idVehicle} className="flex items-center justify-between gap-2 text-sm bg-muted rounded-md px-2 py-1">
                <span>
                  {vehicleById[c.idVehicle] ? vehicleName(vehicleById[c.idVehicle]) : `Vehículo ${c.idVehicle}`} ({c.from}–{c.until})
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    setData((current) => ({
                      ...current,
                      compatibilidades: current.compatibilidades.filter((other) => other.idVehicle !== c.idVehicle),
                    }))
                  }
                  className="text-xs font-bold text-muted-foreground hover:text-destructive"
                >
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        )}
        <AddVehicle
          vehicles={vehicles}
          chosen={info.compatibilidades.map((c) => c.idVehicle)}
          onAdd={(compatibilidad) =>
            setData((current) => ({ ...current, compatibilidades: [...current.compatibilidades, compatibilidad] }))
          }
        />
        {errors.compatibilidades && <p className="text-xs text-destructive">{errors.compatibilidades}</p>}
      </FieldSet>

      {errorServer && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{errorServer}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={saving} className="h-10 px-6 self-end hover:bg-orange-600">
        {saving ? "Guardando…" : isSignup ? "Dar de alta" : "Guardar cambios"}
      </Button>
    </form>
  );
}

// Alta (sin repuestoId) o edición de un repuesto (HU 5.10). El stock de un
// repuesto existente no se cambia acá: se ajusta con DialogoAjustarStock.
export default function PartForm({ isOpen, onChange, idPart = null, categories = [], onSaved }) {
  return (
    <DashboardDialog
      isOpen={isOpen}
      onChange={onChange}
      title={idPart == null ? "Nuevo repuesto" : "Editar repuesto"}
      description="Aparece en el catálogo y en los filtros por vehículo de los vehículos que elijas."
    >
      <FormContent idPart={idPart} categories={categories} onSaved={onSaved} />
    </DashboardDialog>
  );
}
