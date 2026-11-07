// Repuestos en riesgo de agotarse.

import { useState } from "react";
import { PackagePlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getStockoutRisk } from "./dashboardApi";
import { RISKS, formatDays, formatMonth, formatNumber } from "./format";
import { QueryState, RiskBadge, PartName, Options, Panel, NoData } from "./pieces";
import { useQuery } from "./useQuery";

const PAGE_SIZE = 50;

// "Para reponer" (alto y medio) es lo mismo que cuenta el resumen, y es
// con lo que abre la sección.
const LEVELS = {
  restock: { texto: "Para reponer", riesgos: ["high", "medium"] },
  high: { texto: RISKS.high.label, riesgos: ["high"] },
  medium: { texto: RISKS.medium.label, riesgos: ["medium"] },
  low: { texto: RISKS.low.label, riesgos: ["low"] },
  all: { texto: "Todos", riesgos: ["high", "medium", "low"] },
};

// Riesgo de agotamiento (HU 5.6): días de cobertura = stock / demanda
// diaria proyectada. Viene ordenado del más urgente al menos urgente. Abre
// con los que hay que reponer (riesgo alto y medio), se puede filtrar por
// nivel y reponer desde cada fila (HU 5.10).
export default function StockoutRisk({ filters, onDetail, onRestock }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [level, setLevel] = useState("restock");
  const queryState = useQuery(
    () => getStockoutRisk(filters),
    `${filters.categoria}|${filters.search}`
  );

  return (
    <Panel
      title="Riesgo de agotamiento"
      id="titulo-riesgo"
      details={
        queryState.info
          ? `Para cuántos días alcanza el stock al ritmo proyectado para ${formatMonth(queryState.info.month, { long: true })}. Alto: menos de ${queryState.info.umbrales.high} días; medio: de ${queryState.info.umbrales.high} a ${queryState.info.umbrales.medium}; bajo: más de ${queryState.info.umbrales.medium}.`
          : null
      }
    >
      <QueryState queryState={queryState}>
        {({ repuestos }) => {
          if (repuestos.length === 0) return <NoData>No hay repuestos con estos filtros.</NoData>;
          const of = (rawValue) => repuestos.filter((r) => LEVELS[rawValue].riesgos.includes(r.risk));
          const filtered = of(level);
          return (
            <>
              <div className="mb-4">
                <Options
                  label="Nivel de riesgo"
                  rawValue={level}
                  onChange={(rawValue) => {
                    setLevel(rawValue);
                    setVisible(PAGE_SIZE);
                  }}
                  opciones={Object.entries(LEVELS).map(([rawValue, { texto }]) => [
                    rawValue,
                    `${texto} (${formatNumber(of(rawValue).length)})`,
                  ])}
                />
              </div>
              <div className="-mx-4 sm:-mx-5 border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4 sm:pl-5">Repuesto</TableHead>
                      <TableHead>Riesgo</TableHead>
                      <TableHead className="text-right">Alcanza para</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Demanda proyectada</TableHead>
                      {onRestock && <TableHead className="pr-4 sm:pr-5"><span className="sr-only">Acciones</span></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(0, visible).map((part) => (
                      <TableRow key={part.id}>
                        <TableCell className="pl-4 sm:pl-5">
                          <PartName part={part} onDetail={onDetail} withCode />
                        </TableCell>
                        <TableCell>
                          <RiskBadge risk={part.risk} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatDays(part.coverageDays)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatNumber(part.stock)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground hidden md:table-cell">
                          {formatNumber(part.projectedDemand)} / mes
                        </TableCell>
                        {onRestock && (
                          <TableCell className="pr-4 sm:pr-5 text-right">
                            <Button
                              variant={part.risk === "low" ? "ghost" : "outline"}
                              size="sm"
                              onClick={() => onRestock(part)}
                              aria-label={`Reponer ${part.displayName} (${part.code})`}
                              className="h-7 px-2.5 text-xs"
                            >
                              <PackagePlusIcon />
                              Reponer
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Mostrando {formatNumber(Math.min(visible, filtered.length))} de {formatNumber(filtered.length)} repuestos.
                </p>
                {filtered.length > visible && (
                  <Button variant="outline" size="sm" onClick={() => setVisible((current) => current + PAGE_SIZE)} className="text-xs">
                    Mostrar más
                  </Button>
                )}
              </div>
            </>
          );
        }}
      </QueryState>
    </Panel>
  );
}
