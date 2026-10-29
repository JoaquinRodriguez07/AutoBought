import { useState } from "react";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PERIODOS, PERIODO_POR_DEFECTO } from "./formato";

// Base UI no deja un valor vacío en el Select: "todas" es sin filtro.
const TODAS = "todas";

const claseEtiqueta = "text-[10px] font-black tracking-[2px] text-muted-foreground";

// Filtros del dashboard (HU 5.9): categoría, repuesto (nombre o código) y
// período. Se aplican al momento, salvo la búsqueda, que se aplica al
// presionar Buscar o Enter para no pedir datos en cada tecla.
export default function BarraFiltros({ filtros, categorias, onCambiar, onQuitar }) {
  const [texto, setTexto] = useState(filtros.busqueda);
  const [textoAplicado, setTextoAplicado] = useState(filtros.busqueda);

  // Si la búsqueda cambia desde afuera (Quitar filtros), el campo la sigue.
  if (filtros.busqueda !== textoAplicado) {
    setTextoAplicado(filtros.busqueda);
    setTexto(filtros.busqueda);
  }

  const hayFiltros =
    Boolean(filtros.categoria) || Boolean(filtros.busqueda) || filtros.meses !== PERIODO_POR_DEFECTO;

  const items = [
    { value: TODAS, label: "Todas" },
    ...categorias.map((nombre) => ({ value: nombre, label: nombre })),
  ];

  const buscar = (event) => {
    event.preventDefault();
    onCambiar({ busqueda: texto.trim() });
  };

  return (
    <section
      aria-label="Filtros"
      className="mt-6 flex flex-col lg:flex-row lg:items-end gap-4 bg-muted border rounded-xl p-4"
    >
      <div className="flex flex-col gap-1.5 lg:w-52">
        <span className={claseEtiqueta}>CATEGORÍA</span>
        <Select
          items={items}
          value={filtros.categoria || TODAS}
          onValueChange={(valor) => onCambiar({ categoria: valor === TODAS ? "" : valor })}
        >
          <SelectTrigger aria-label="Categoría" className="h-10 w-full bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} className="max-h-72">
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <form onSubmit={buscar} className="flex flex-col gap-1.5 flex-1">
        <Label htmlFor="filtro-repuesto" className={claseEtiqueta}>
          REPUESTO
        </Label>
        <div className="flex gap-2">
          <Input
            id="filtro-repuesto"
            type="search"
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
            placeholder="Nombre o código"
            className="h-10 flex-1 min-w-0 bg-background"
          />
          <Button type="submit" className="h-10 px-4 bg-gray-900 text-white hover:bg-black font-black text-xs">
            <SearchIcon />
            Buscar
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-1.5">
        <span className={claseEtiqueta}>PERÍODO</span>
        <ToggleGroup
          aria-label="Período"
          variant="outline"
          spacing={0}
          value={[String(filtros.meses)]}
          onValueChange={(valor) => valor.length && onCambiar({ meses: Number(valor[0]) })}
          className="bg-background"
        >
          {PERIODOS.map((meses) => (
            <ToggleGroupItem
              key={meses}
              value={String(meses)}
              aria-label={`Últimos ${meses} meses`}
              className="h-10 px-3 text-xs font-bold aria-pressed:bg-primary aria-pressed:text-primary-foreground hover:aria-pressed:bg-primary"
            >
              {meses} meses
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={onQuitar}
        disabled={!hayFiltros}
        className="h-10 px-4 text-xs font-black"
      >
        Quitar filtros
      </Button>
    </section>
  );
}
