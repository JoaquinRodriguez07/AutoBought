import { useId } from "react";
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMonth, formatNumber, formatPesos, change } from "./format";

// --color-serie lo define ChartContainer a partir de `config`: el naranja
// de la tienda un paso más oscuro (--chart-1), porque el 500 no llega a 3:1
// sobre blanco para una línea fina. La proyección es la misma serie, punteada.
const SERIES_COLOR = "var(--color-serie)";
const BACKGROUND_COLOR = "var(--background)";

const METRICS = {
  unidades: { nombre: "Unidades vendidas", formatear: formatNumber },
  facturacion: { nombre: "Facturación", formatear: formatPesos },
};

function ChangeText({ actual, anterior, formatear }) {
  const cambio = change(actual, anterior);
  if (!cambio) return null;
  const signo = cambio.diferencia > 0 ? "+" : cambio.diferencia < 0 ? "−" : "±";
  const percentage = cambio.percentage === null ? "" : ` (${signo}${Math.abs(cambio.percentage)} %)`;
  return (
    <span>
      {signo}
      {formatear(Math.abs(cambio.diferencia))}
      {percentage} vs. el mes anterior
    </span>
  );
}

function Tooltip({ active, payload, metrica }) {
  if (!active || !payload?.length) return null;
  const punto = payload[0].payload;
  const { formatear, nombre } = METRICS[metrica];

  return (
    <div className="grid gap-1 rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold first-letter:uppercase">{formatMonth(punto.mes, { largo: true })}</p>
      {punto.esProyeccion ? (
        <p className="text-muted-foreground">
          Proyección: <strong className="text-foreground">{formatNumber(punto.proyectada)}</strong> unidades
        </p>
      ) : (
        <>
          <p className="text-muted-foreground">
            {nombre}: <strong className="text-foreground">{formatear(punto.real)}</strong>
          </p>
          <p className="text-muted-foreground">
            <ChangeText actual={punto.real} anterior={punto.anterior} formatear={formatear} />
          </p>
          {punto.enCurso && <p className="text-muted-foreground">Mes en curso: ventas hasta hoy.</p>}
        </>
      )}
    </div>
  );
}

// Etiqueta directa solo en el punto proyectado: el resto lo dice el globo.
function ForecastLabel({ x, y, value, index, ultimo }) {
  if (index !== ultimo || value === null || value === undefined) return null;
  return (
    <text x={x} y={y - 12} textAnchor="end" fontSize={11} fontWeight={700} className="fill-foreground">
      {formatNumber(value)}
    </text>
  );
}

function Legend({ children, simbolo }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="20" height="10" aria-hidden="true">
        {simbolo}
      </svg>
      {children}
    </span>
  );
}

export default function SalesChart({ meses, proyeccion, metrica = "unidades", titulo }) {
  const conProyeccion = Boolean(proyeccion) && metrica === "unidades";
  const { formatear, nombre } = METRICS[metrica];

  const datos = meses.map((mes, i) => ({
    ...mes,
    real: mes[metrica],
    anterior: i > 0 ? meses[i - 1][metrica] : undefined,
    // La línea punteada sale del último mes real hacia el proyectado.
    proyectada: conProyeccion && i === meses.length - 1 ? mes.unidades : null,
  }));
  if (conProyeccion) {
    datos.push({ mes: proyeccion.mes, real: null, proyectada: proyeccion.unidades, esProyeccion: true });
  }

  const config = { serie: { label: nombre, color: "var(--chart-1)" } };
  // Un id por gráfico para el degradado (sin los ":" de useId, que rompen url(#...)).
  const idRelleno = `relleno-${useId().replace(/:/g, "")}`;

  return (
    <figure aria-label={titulo || nombre}>
      <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
        <ComposedChart data={datos} margin={{ top: 20, right: 24, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={idRelleno} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_COLOR} stopOpacity={0.18} />
              <stop offset="100%" stopColor={SERIES_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="mes"
            tickFormatter={(mes) => formatMonth(mes)}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tickFormatter={(valor) => (metrica === "facturacion" ? formatPesos(valor) : formatNumber(valor))}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={metrica === "facturacion" ? 84 : 44}
            allowDecimals={false}
          />
          <ChartTooltip content={<Tooltip metrica={metrica} />} cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} />
          {/* Solo el relleno debajo de la línea real: los datos los dibuja la Line. */}
          <Area
            type="linear"
            dataKey="real"
            stroke="none"
            fill={`url(#${idRelleno})`}
            tooltipType="none"
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="real"
            stroke={SERIES_COLOR}
            strokeWidth={2.5}
            // El mes en curso va hueco: sus ventas son hasta hoy, no una caída.
            dot={(props) =>
              props.value == null ? (
                <g key={props.index} />
              ) : (
                <circle
                  key={props.index}
                  cx={props.cx}
                  cy={props.cy}
                  r={4}
                  fill={props.payload.enCurso ? BACKGROUND_COLOR : SERIES_COLOR}
                  stroke={props.payload.enCurso ? SERIES_COLOR : BACKGROUND_COLOR}
                  strokeWidth={2}
                />
              )
            }
            activeDot={{ r: 6, stroke: BACKGROUND_COLOR, strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          {conProyeccion && (
            <Line
              type="linear"
              dataKey="proyectada"
              stroke={SERIES_COLOR}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={(props) =>
                props.index === datos.length - 1 ? (
                  <circle key="proyectado" cx={props.cx} cy={props.cy} r={5} fill={BACKGROUND_COLOR} stroke={SERIES_COLOR} strokeWidth={2} />
                ) : (
                  <g key={props.index} />
                )
              }
              label={<ForecastLabel ultimo={datos.length - 1} />}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ChartContainer>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground mt-2">
        <Legend simbolo={<line x1="0" y1="5" x2="20" y2="5" stroke="var(--chart-1)" strokeWidth="2" />}>{nombre}</Legend>
        {conProyeccion && (
          <Legend
            simbolo={<line x1="0" y1="5" x2="20" y2="5" stroke="var(--chart-1)" strokeWidth="2" strokeDasharray="4 3" />}
          >
            Proyección de {formatMonth(proyeccion.mes, { largo: true })}
          </Legend>
        )}
        {meses.some((mes) => mes.enCurso) && (
          <Legend simbolo={<circle cx="10" cy="5" r="4" fill="var(--background)" stroke="var(--chart-1)" strokeWidth="2" />}>
            Mes en curso (hasta hoy)
          </Legend>
        )}
      </div>

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground w-fit">Ver como tabla</summary>
        <Table className="mt-2 max-w-[560px] text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Mes</TableHead>
              <TableHead className="text-right">{nombre}</TableHead>
              <TableHead>Variación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {datos.map((punto) => (
              <TableRow key={punto.mes}>
                <TableCell className="first-letter:uppercase">
                  {formatMonth(punto.mes, { largo: true })}
                  {punto.enCurso && " (en curso)"}
                  {punto.esProyeccion && " (proyección)"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {punto.esProyeccion ? formatNumber(punto.proyectada) : formatear(punto.real)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {!punto.esProyeccion && (
                    <ChangeText actual={punto.real} anterior={punto.anterior} formatear={formatear} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </figure>
  );
}
