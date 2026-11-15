// Barra de filtros del dashboard del vendedor.

import { useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PERIODS, DEFAULT_PERIOD } from "./format";

// Base UI no deja un valor vacío en el Select: "todas" es sin filtro.
const ALL = "todas";

// Filtros del dashboard (HU 5.9): categoría, repuesto (nombre o código) y
// período. Se aplican al momento, salvo la búsqueda, que se aplica al
// presionar Buscar o Enter para no pedir datos en cada tecla. El período
// solo aparece en las secciones que lo usan (`conPeriodo`).
export default function FilterBar({ filters, categories, withPeriod = true, onChange, onRemove }) {
  const [texto, setText] = useState(filters.search);
  const [appliedText, setAppliedText] = useState(filters.search);

  // Si la búsqueda cambia desde afuera (Quitar filtros), el campo la sigue.
  if (filters.search !== appliedText) {
    setAppliedText(filters.search);
    setText(filters.search);
  }

  const hasFilters =
    Boolean(filters.categoria) || Boolean(filters.search) || filters.months !== DEFAULT_PERIOD;

  const items = [
    { value: ALL, label: "Todas las categorías" },
    ...categories.map((displayName) => ({ value: displayName, label: displayName })),
  ];

  const runSearch = (event) => {
    event.preventDefault();
    onChange({ search: texto.trim() });
  };

  return (
    <section aria-label="Filtros" className="mt-6 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
      <form onSubmit={runSearch} className="flex gap-2 sm:flex-1 sm:min-w-[260px] sm:max-w-md">
        <div className="relative flex-1 min-w-0">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="filtro-repuesto" className="sr-only">
            Repuesto
          </label>
          <Input
            id="filtro-repuesto"
            type="search"
            value={texto}
            onChange={(event) => setText(event.target.value)}
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
        value={filters.categoria || ALL}
        onValueChange={(rawValue) => onChange({ categoria: rawValue === ALL ? "" : rawValue })}
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

      {withPeriod && (
        <ToggleGroup
          aria-label="Período"
          variant="outline"
          spacing={0}
          value={[String(filters.months)]}
          onValueChange={(rawValue) => rawValue.length && onChange({ months: Number(rawValue[0]) })}
          className="rounded-lg bg-card"
        >
          {PERIODS.map((months) => (
            <ToggleGroupItem
              key={months}
              value={String(months)}
              aria-label={`Últimos ${months} meses`}
              className="h-9 px-3 text-xs font-medium text-muted-foreground aria-pressed:bg-gray-900 aria-pressed:text-white hover:aria-pressed:bg-gray-900"
            >
              {months} meses
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {hasFilters && (
        <Button type="button" variant="ghost" onClick={onRemove} className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground">
          <XIcon />
          Quitar filtros
        </Button>
      )}
    </section>
  );
}
