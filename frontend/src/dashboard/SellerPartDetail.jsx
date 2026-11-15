// Detalle de un repuesto en el portal del vendedor, con sus ventas.

import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeftIcon, PackagePlusIcon, PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AdjustStockDialog from "./AdjustStockDialog";
import PartForm from "./PartForm";
import SalesChart from "./SalesChart";
import SellerLayout from "./SellerLayout";
import { getPartDetail } from "./dashboardApi";
import { formatDays, formatMonth, formatNumber, formatPesos } from "./format";
import { QueryState, Metric, RiskBadge, StockBadge, Panel, NoData } from "./pieces";
import { useQuery } from "./useQuery";
import { extraImagesForType } from "../partImages";
import { partImage, useGenericImage } from "../mapPart";

// La foto del repuesto, la misma que ve el cliente en la tienda (la de su
// tipo de pieza y fabricante), con la segunda vista si la hay.
function PartPhoto({ displayName }) {
  const photos = [partImage(displayName), ...extraImagesForType(displayName)];
  const [active, setActive] = useState(0);
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="grid aspect-square place-items-center rounded-lg bg-white">
        <img
          key={photos[active]}
          src={photos[active]}
          onError={useGenericImage}
          alt={`Foto de ${displayName}`}
          className="max-h-full w-full object-contain p-2"
        />
      </div>
      {photos.length > 1 && (
        <div className="flex gap-2">
          {photos.map((photo, indice) => (
            <button
              key={photo}
              type="button"
              onClick={() => setActive(indice)}
              aria-label={`Ver foto ${indice + 1}`}
              aria-pressed={active === indice}
              className={cn(
                "size-14 overflow-hidden rounded-md border-2 bg-white p-1",
                active === indice ? "border-orange-500" : "border-gray-200 hover:border-gray-300"
              )}
            >
              <img src={photo} onError={useGenericImage} alt="" className="size-full object-contain" />
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Así se ve en la tienda.</p>
    </div>
  );
}

// Detalle de un repuesto para el vendedor (HU 5.8): stock, ventas,
// evolución, proyección y riesgo. Desde acá se edita y se repone (HU 5.10).
export default function SellerPartDetail({ sessionUser, onHome, onCloseSession }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [dialogo, setDialogo] = useState(null); // "editar" | "stock" | null
  const queryState = useQuery(() => getPartDetail(id), id);

  const goBack = () => navigate(`/dashboard${location.state?.from || ""}`);

  const onSave = () => {
    setDialogo(null);
    queryState.reload();
  };

  const part = queryState.info;

  return (
    <SellerLayout
      sessionUser={sessionUser}
      vista={null}
      onView={(rawValue) => navigate(rawValue === "summary" ? "/dashboard" : `/dashboard?vista=${rawValue}`)}
      onStore={onHome}
      onCloseSession={onCloseSession}
      titleBefore={
        <Button
          variant="ghost"
          size="sm"
          onClick={goBack}
          className="-ml-2 mb-3 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon />
          Volver al dashboard
        </Button>
      }
      title={part?.displayName ?? "Repuesto"}
      description={
        part && `${part.code} · ${part.categoria} · ${part.fabricante} · ${formatPesos(part.price)}`
      }
      actions={
        part && (
          <>
            <Button
              variant="outline"
              onClick={() => setDialogo("editar")}
              className="h-9 px-4"
            >
              <PencilIcon />
              Editar
            </Button>
            <Button onClick={() => setDialogo("stock")} className="h-9 px-4 hover:bg-orange-600">
              <PackagePlusIcon />
              Ajustar stock
            </Button>
          </>
        )
      }
    >
      <div>
        <QueryState queryState={queryState}>
          {(part) => (
            <>
              {/* La foto al lado de los números: el vendedor ve qué pieza es. */}
              <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] gap-6 items-start">
                <PartPhoto key={part.id} displayName={part.displayName} />
                <div className="grid grid-cols-2 gap-4">
                  <Metric
                    title="Stock actual"
                    rawValue={formatNumber(part.stock)}
                    details={<StockBadge stock={part.stock} stockLow={part.stockLow} />}
                  />
                  <Metric title="Unidades vendidas" rawValue={formatNumber(part.unitsSold)} details="Todas las ventas registradas" />
                  <Metric
                    title="Demanda proyectada"
                    rawValue={formatNumber(part.projectedDemand)}
                    details={`Unidades en ${formatMonth(part.forecast.month, { long: true })}`}
                  />
                  <Metric
                    title="Cobertura"
                    rawValue={formatDays(part.coverageDays)}
                    details={<RiskBadge risk={part.risk} />}
                  />
                </div>
              </div>

              <Panel title="Ventas de los últimos 12 meses y proyección" id="titulo-ventas-repuesto" className="mt-6">
                {part.unitsSold === 0 ? (
                  <NoData>Este repuesto todavía no registra ventas</NoData>
                ) : (
                  <SalesChart
                    months={part.months}
                    forecast={part.forecast}
                    title={`Ventas reales y demanda proyectada de ${part.displayName}`}
                  />
                )}
              </Panel>

              <AdjustStockDialog
                isOpen={dialogo === "stock"}
                onChange={(isOpen) => setDialogo(isOpen ? "stock" : null)}
                part={part}
                onSaved={onSave}
              />
              <PartForm
                isOpen={dialogo === "editar"}
                onChange={(isOpen) => setDialogo(isOpen ? "editar" : null)}
                idPart={part.id}
                onSaved={onSave}
              />
            </>
          )}
        </QueryState>
      </div>
    </SellerLayout>
  );
}
