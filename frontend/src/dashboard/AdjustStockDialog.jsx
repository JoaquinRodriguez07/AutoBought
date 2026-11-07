// Ventana para ajustar el stock de un repuesto.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adjustStock } from "./dashboardApi";
import { FormField, DashboardDialog } from "./pieces";

function AdjustContent({ repuesto, onGuardado }) {
  const [stock, setStock] = useState(String(repuesto.stock));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async (event) => {
    event.preventDefault();
    if (!/^\d+$/.test(stock.trim())) {
      setError("El stock es un número entero, 0 o más.");
      return;
    }
    setError("");
    setGuardando(true);
    try {
      onGuardado(await adjustStock(repuesto.id, stock.trim()));
    } catch (falla) {
      setError(falla.message);
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={guardar} noValidate className="flex flex-col gap-4">
      <FormField id="nuevo-stock" etiqueta="Unidades disponibles" error={error}>
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
        Hoy tiene {repuesto.stock}. Si estaba agotado, se avisa por mail a quienes pidieron que les avisemos.
      </p>
      <Button type="submit" disabled={guardando} className="h-10 px-6 self-end hover:bg-orange-600">
        {guardando ? "Guardando…" : "Guardar stock"}
      </Button>
    </form>
  );
}

// Ajuste de stock de un repuesto (HU 5.10).
export default function AdjustStockDialog({ abierto, onCambiar, repuesto, onGuardado }) {
  return (
    <DashboardDialog
      abierto={abierto}
      onCambiar={onCambiar}
      titulo="Ajustar stock"
      descripcion={repuesto ? `${repuesto.nombre} · ${repuesto.codigo}` : null}
      ancho="sm:max-w-[420px]"
    >
      {repuesto && <AdjustContent repuesto={repuesto} onGuardado={onGuardado} />}
    </DashboardDialog>
  );
}
