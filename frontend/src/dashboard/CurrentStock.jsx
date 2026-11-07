// El stock actual de los repuestos.

import { useState } from "react";
import { PackagePlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { stockStatus, formatNumber } from "./format";
import { QueryState, StockBadge, PartName, Options, Panel } from "./pieces";

const PAGE_SIZE = 50;

const STATUS_FILTERS = {
  all: { texto: "Todos", statuses: ["Sin stock", "Stock bajo", "Normal"] },
  bajos: { texto: "Stock bajo o sin stock", statuses: ["Sin stock", "Stock bajo"] },
  soldOut: { texto: "Sin stock", statuses: ["Sin stock"] },
};

// Un número del resumen de arriba de la tabla.
function DataItem({ title, children, tono }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-xs text-muted-foreground">{title}</dt>
      <dd className={tono ?? "text-xl font-semibold tabular-nums mt-0.5"}>{children}</dd>
    </div>
  );
}

// Stock actual de cada repuesto (HU 5.2), de menos a más stock, con un
// resumen arriba y "Ajustar" en cada fila (HU 5.10). La consulta la hace
// el Dashboard. `estadoInicial` llega al tocar "Sin stock" en el resumen.
export default function CurrentStock({ queryState, onDetail, onRestock, initialStatus = "all" }) {
  const [filterStatus, setFilterStatus] = useState(initialStatus in STATUS_FILTERS ? initialStatus : "all");
  const [visible, setVisible] = useState(PAGE_SIZE);

  return (
    <QueryState queryState={queryState}>
      {({ repuestos, thresholdStockLow }) => {
        const howMany = (key) =>
          repuestos.filter((r) => STATUS_FILTERS[key].statuses.includes(stockStatus(r.stock, r.stockLow))).length;
        const filtered = repuestos.filter((r) =>
          STATUS_FILTERS[filterStatus].statuses.includes(stockStatus(r.stock, r.stockLow))
        );
        const stockLow = repuestos.filter((r) => r.stock > 0 && r.stockLow).length;
        const withoutStock = repuestos.filter((r) => r.stock <= 0).length;

        return (
          <div className="flex flex-col gap-6">
            <dl aria-label="Resumen del stock" className="grid grid-cols-2 lg:grid-cols-4 rounded-xl border bg-card divide-x divide-y lg:divide-y-0">
              <DataItem title="Repuestos">{formatNumber(repuestos.length)}</DataItem>
              <DataItem title="Unidades en stock">{formatNumber(repuestos.reduce((total, r) => total + r.stock, 0))}</DataItem>
              <DataItem title="Con stock bajo" tono="text-xl font-semibold tabular-nums mt-0.5 text-amber-600">
                {formatNumber(stockLow)}
              </DataItem>
              <DataItem title="Sin stock" tono="text-xl font-semibold tabular-nums mt-0.5 text-red-600">
                {formatNumber(withoutStock)}
              </DataItem>
            </dl>

            <Panel
              title="Stock por repuesto"
              id="titulo-stock"
              details={`De menos a más stock. Con ${thresholdStockLow} unidades o menos, un repuesto figura con stock bajo.`}
              action={
                <Options
                  label="Estado del stock"
                  rawValue={filterStatus}
                  onChange={(rawValue) => {
                    setFilterStatus(rawValue);
                    setVisible(PAGE_SIZE);
                  }}
                  opciones={Object.entries(STATUS_FILTERS).map(([rawValue, { texto }]) => [
                    rawValue,
                    `${texto} (${formatNumber(howMany(rawValue))})`,
                  ])}
                />
              }
            >
              <div className="-mx-4 sm:-mx-5 border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4 sm:pl-5">Código</TableHead>
                      <TableHead>Repuesto</TableHead>
                      <TableHead className="hidden md:table-cell">Fabricante</TableHead>
                      <TableHead className="hidden md:table-cell">Categoría</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead>Estado</TableHead>
                      {onRestock && <TableHead className="pr-4 sm:pr-5 text-right"><span className="sr-only">Acciones</span></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(0, visible).map((part) => (
                      <TableRow key={part.id}>
                        <TableCell className="pl-4 sm:pl-5 text-xs text-muted-foreground tabular-nums">{part.code}</TableCell>
                        <TableCell>
                          <PartName part={part} onDetail={onDetail} />
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden md:table-cell">{part.fabricante}</TableCell>
                        <TableCell className="text-muted-foreground hidden md:table-cell">{part.categoria}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatNumber(part.stock)}</TableCell>
                        <TableCell>
                          <StockBadge stock={part.stock} stockLow={part.stockLow} />
                        </TableCell>
                        {onRestock && (
                          <TableCell className="pr-4 sm:pr-5 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onRestock(part)}
                              aria-label={`Ajustar stock de ${part.displayName} (${part.code})`}
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <PackagePlusIcon />
                              Ajustar
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
                    Mostrar {formatNumber(Math.min(PAGE_SIZE, filtered.length - visible))} más
                  </Button>
                )}
              </div>
            </Panel>
          </div>
        );
      }}
    </QueryState>
  );
}
