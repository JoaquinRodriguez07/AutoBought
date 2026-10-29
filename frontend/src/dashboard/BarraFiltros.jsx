import { useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PERIODOS, PERIODO_POR_DEFECTO } from "./formato";

// Base UI no deja un valor vacío en el Select: "todas" es sin filtro.
const TODAS = "todas";

// Filtros del dashboard (HU 5.9): categoría, repuesto (nombre o código) y
// período. Se aplican al momento, salvo la búsqueda, que se aplica al
// presionar Buscar o Enter para no pedir datos en cada tecla. El período
// solo aparece en las secciones que lo usan (`conPeriodo`).
export default function BarraFiltros({ filtros, categorias, conPeriodo = true, onCambiar, onQuitar }) {
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
    { value: TODAS, label: "Todas las categorías" },
    ...categorias.map((nombre) => ({ value: nombre, label: nombre })),
  ];

  const buscar = (event) => {
    event.preventDefault();
    onCambiar({ busqueda: texto.trim() });
  };

  return (
    <section aria-label="Filtros" className="mt-6 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
      <form onSubmit={buscar} className="flex gap-2 sm:flex-1 sm:min-w-[260px] sm:max-w-md">
        <div className="relative flex-1 min-w-0">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="filtro-repuesto" className="sr-only">
            Repuesto
          </label>
          <Input
            id="filtro-repuesto"
            type="search"
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
            placeholder="Buscar repuesto por nombre o código"
            className="h-9 w-full pl-9 bg-card"
          />
        </div>
        <Button type="submit" variant="secondary" className="h-9 px-3 text-xs">
          Buscar
        </Button>
      </form>

      <Select
        items={items}
        value={filtros.categoria || TODAS}
        onValueChange={(valor) => onCambiar({ categoria: valor === TODAS ? "" : valor })}
      >
        <SelectTrigger aria-label="Categoría" className="h-9 w-full sm:w-56 bg-card">
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

      {conPeriodo && (
        <ToggleGroup
          aria-label="Período"
          variant="outline"
          spacing={0}
          value={[String(filtros.meses)]}
          onValueChange={(valor) => valor.length && onCambiar({ meses: Number(valor[0]) })}
          className="rounded-lg bg-card"
        >
          {PERIODOS.map((meses) => (
            <ToggleGroupItem
              key={meses}
              value={String(meses)}
              aria-label={`Últimos ${meses} meses`}
              className="h-9 px-3 text-xs font-medium text-muted-foreground aria-pressed:bg-gray-900 aria-pressed:text-white hover:aria-pressed:bg-gray-900"
            >
              {meses} meses
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {hayFiltros && (
        <Button type="button" variant="ghost" onClick={onQuitar} className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground">
          <XIcon />
          Quitar filtros
        </Button>
      )}
    </section>
  );
}
