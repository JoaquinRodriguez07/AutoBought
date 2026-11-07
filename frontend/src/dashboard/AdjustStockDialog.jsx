// Ventana para ajustar el stock de un repuesto.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adjustStock } from "./dashboardApi";
import { FormField, DashboardDialog } from "./pieces";

function AdjustContent({ part, onSaved }) {
  const [stock, setStock] = useState(String(part.stock));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    if (!/^\d+$/.test(stock.trim())) {
      setError("El stock es un número entero, 0 o más.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      onSaved(await adjustStock(part.id, stock.trim()));
    } catch (failure) {
      setError(failure.message);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4">
      <FormField id="nuevo-stock" label="Unidades disponibles" error={error}>
        <Input
          id="nuevo-stock"
          inputMode="numeric"
          value={stock}
          onChange={(event) => setStock(event.target.value)}
          aria-invalid={Boolean(error)}
          className="h-10"
        />
      </FormField>
      <p className="text-xs text-muted-foreground">
        Hoy tiene {part.stock}. Si estaba agotado, se avisa por mail a quienes pidieron que les avisemos.
      </p>
      <Button type="submit" disabled={saving} className="h-10 px-6 self-end hover:bg-orange-600">
        {saving ? "Guardando…" : "Guardar stock"}
      </Button>
    </form>
  );
}

// Ajuste de stock de un repuesto (HU 5.10).
export default function AdjustStockDialog({ isOpen, onChange, part, onSaved }) {
  return (
    <DashboardDialog
      isOpen={isOpen}
      onChange={onChange}
      title="Ajustar stock"
      description={part ? `${part.displayName} · ${part.code}` : null}
      ancho="sm:max-w-[420px]"
    >
      {part && <AdjustContent part={part} onSaved={onSaved} />}
    </DashboardDialog>
  );
}
