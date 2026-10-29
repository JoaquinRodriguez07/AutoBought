import { useEffect, useState } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { crearRepuesto, editarRepuesto, obtenerRepuestoParaEditar, obtenerVehiculos } from "./apiDashboard";
import { Campo, Dialogo } from "./piezas";

const VACIO = {
  codigo: "",
  nombre: "",
  fabricante: "",
  categoria: "",
  precio: "",
  stock: "0",
  color: "",
  garantiaMeses: "",
  descripcion: "",
  compatibilidades: [],
};

const ANIO_ACTUAL = new Date().getFullYear();

const nombreVehiculo = (v) => [v.marca, v.modelo, v.motor].filter(Boolean).join(" ");

const esEntero = (texto) => /^\d+$/.test(String(texto).trim());

function validar(datos, esAlta) {
  const errores = {};
  if (!datos.codigo.trim()) errores.codigo = "Ingresá el código.";
  if (!datos.nombre.trim()) errores.nombre = "Ingresá el nombre.";
  if (!datos.fabricante.trim()) errores.fabricante = "Ingresá el fabricante.";
  if (!datos.categoria.trim()) errores.categoria = "Ingresá la categoría.";
  if (!esEntero(datos.precio) || Number(datos.precio) <= 0) errores.precio = "El precio es un número entero mayor que 0.";
  if (esAlta && !esEntero(datos.stock)) errores.stock = "El stock es un número entero, 0 o más.";
  if (datos.garantiaMeses !== "" && !esEntero(datos.garantiaMeses)) errores.garantiaMeses = "Meses enteros, o vacío.";
  if (datos.compatibilidades.length === 0) errores.compatibilidades = "Agregá al menos un vehículo compatible.";
  return errores;
}

// Selector de un vehículo compatible con su rango de años.
function AgregarVehiculo({ vehiculos, elegidos, onAgregar }) {
  const [vehiculoId, setVehiculoId] = useState("");
  const [desde, setDesde] = useState(String(ANIO_ACTUAL - 10));
  const [hasta, setHasta] = useState(String(ANIO_ACTUAL));
  const [error, setError] = useState("");

  const porMarca = {};
  vehiculos.forEach((v) => {
    if (!elegidos.includes(v.id)) (porMarca[v.marca] ||= []).push(v);
  });

  const agregar = () => {
    if (!vehiculoId) return setError("Elegí un vehículo.");
    if (!esEntero(desde) || !esEntero(hasta) || Number(hasta) < Number(desde)) {
      return setError("Revisá los años: el año hasta no puede ser anterior al desde.");
    }
    setError("");
    onAgregar({ vehiculoId: Number(vehiculoId), desde: Number(desde), hasta: Number(hasta) });
    setVehiculoId("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_5rem_5rem_auto] gap-2 items-end">
        <Campo id="vehiculo" etiqueta="Vehículo">
          <NativeSelect id="vehiculo" value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)} className="w-full *:h-10">
            <NativeSelectOption value="">Elegí un vehículo</NativeSelectOption>
            {Object.entries(porMarca).map(([marca, lista]) => (
              <NativeSelectOptGroup key={marca} label={marca}>
                {lista.map((v) => (
                  <NativeSelectOption key={v.id} value={v.id}>
                    {nombreVehiculo(v)}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ))}
          </NativeSelect>
        </Campo>
        <Campo id="vehiculo-desde" etiqueta="Desde">
          <Input id="vehiculo-desde" inputMode="numeric" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-10" />
        </Campo>
        <Campo id="vehiculo-hasta" etiqueta="Hasta">
          <Input id="vehiculo-hasta" inputMode="numeric" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-10" />
        </Campo>
        <Button type="button" onClick={agregar} variant="secondary" className="h-10 px-3 text-xs">
          Agregar
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ContenidoFormulario({ repuestoId, categorias, onGuardado }) {
  const esAlta = repuestoId == null;
  const [datos, setDatos] = useState(VACIO);
  const [vehiculos, setVehiculos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    Promise.all([obtenerVehiculos(), esAlta ? null : obtenerRepuestoParaEditar(repuestoId)])
      .then(([lista, repuesto]) => {
        if (!vigente) return;
        setVehiculos(lista);
        if (repuesto) {
          // /parts/{id} trae los vehículos por nombre: se buscan sus ids.
          const compatibilidades = repuesto.compatibilidades
            .map((c) => {
              const vehiculo = lista.find((v) => v.marca === c.marca && v.modelo === c.modelo && v.motor === c.motor);
              return vehiculo && { vehiculoId: vehiculo.id, desde: c.desde, hasta: c.hasta };
            })
            .filter(Boolean);
          setDatos({
            ...VACIO,
            ...repuesto,
            precio: String(repuesto.precio),
            garantiaMeses: String(repuesto.garantiaMeses),
            compatibilidades,
          });
        }
        setCargando(false);
      })
      .catch((error) => {
        if (!vigente) return;
        setErrorServidor(error.message);
        setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [esAlta, repuestoId]);

  const cambiar = (campo) => (event) => setDatos((actual) => ({ ...actual, [campo]: event.target.value }));

  const guardar = async (event) => {
    event.preventDefault();
    const encontrados = validar(datos, esAlta);
    setErrores(encontrados);
    setErrorServidor("");
    if (Object.keys(encontrados).length) return;

    setGuardando(true);
    try {
      const guardado = esAlta ? await crearRepuesto(datos) : await editarRepuesto(repuestoId, datos);
      onGuardado(guardado);
    } catch (error) {
      setErrorServidor(error.message);
      setGuardando(false);
    }
  };

  if (cargando) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const texto = (campo, etiqueta, props = {}) => (
    <Campo id={`repuesto-${campo}`} etiqueta={etiqueta} error={errores[campo]}>
      <Input
        id={`repuesto-${campo}`}
        value={datos[campo]}
        onChange={cambiar(campo)}
        aria-invalid={Boolean(errores[campo])}
        aria-describedby={errores[campo] ? `repuesto-${campo}-error` : undefined}
        className="h-10"
        {...props}
      />
    </Campo>
  );

  const vehiculoPorId = Object.fromEntries(vehiculos.map((v) => [v.id, v]));

  return (
    <form onSubmit={guardar} noValidate className="flex flex-col gap-4">
      <div className="grid sm:grid-cols-2 gap-3">
        {texto("codigo", "Código", { placeholder: "FRE-0101" })}
        {texto("nombre", "Nombre")}
        {texto("fabricante", "Fabricante")}
        {texto("categoria", "Categoría", { list: "categorias-repuesto" })}
        {texto("precio", "Precio ($)", { inputMode: "numeric" })}
        {esAlta && texto("stock", "Stock inicial", { inputMode: "numeric" })}
        {texto("color", "Color (opcional)")}
        {texto("garantiaMeses", "Garantía en meses (opcional)", { inputMode: "numeric" })}
      </div>
      <datalist id="categorias-repuesto">
        {categorias.map((nombre) => (
          <option key={nombre} value={nombre} />
        ))}
      </datalist>

      <Campo id="repuesto-descripcion" etiqueta="Descripción (opcional)">
        <Textarea id="repuesto-descripcion" rows={3} value={datos.descripcion} onChange={cambiar("descripcion")} />
      </Campo>

      <FieldSet className="border rounded-lg p-3 gap-3">
        <FieldLegend variant="label" className="px-1 text-xs font-bold">
          Vehículos compatibles
        </FieldLegend>
        {datos.compatibilidades.length > 0 && (
          <ul aria-label="Vehículos elegidos" className="flex flex-col gap-1 mb-3">
            {datos.compatibilidades.map((c) => (
              <li key={c.vehiculoId} className="flex items-center justify-between gap-2 text-sm bg-muted rounded-md px-2 py-1">
                <span>
                  {vehiculoPorId[c.vehiculoId] ? nombreVehiculo(vehiculoPorId[c.vehiculoId]) : `Vehículo ${c.vehiculoId}`} ({c.desde}–{c.hasta})
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    setDatos((actual) => ({
                      ...actual,
                      compatibilidades: actual.compatibilidades.filter((otra) => otra.vehiculoId !== c.vehiculoId),
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
        <AgregarVehiculo
          vehiculos={vehiculos}
          elegidos={datos.compatibilidades.map((c) => c.vehiculoId)}
          onAgregar={(compatibilidad) =>
            setDatos((actual) => ({ ...actual, compatibilidades: [...actual.compatibilidades, compatibilidad] }))
          }
        />
        {errores.compatibilidades && <p className="text-xs text-destructive">{errores.compatibilidades}</p>}
      </FieldSet>

      {errorServidor && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{errorServidor}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={guardando} className="h-10 px-6 self-end hover:bg-orange-600">
        {guardando ? "Guardando…" : esAlta ? "Dar de alta" : "Guardar cambios"}
      </Button>
    </form>
  );
}

// Alta (sin repuestoId) o edición de un repuesto (HU 5.10). El stock de un
// repuesto existente no se cambia acá: se ajusta con DialogoAjustarStock.
export default function FormularioRepuesto({ abierto, onCambiar, repuestoId = null, categorias = [], onGuardado }) {
  return (
    <Dialogo
      abierto={abierto}
      onCambiar={onCambiar}
      titulo={repuestoId == null ? "Nuevo repuesto" : "Editar repuesto"}
      descripcion="Aparece en el catálogo y en los filtros por vehículo de los vehículos que elijas."
    >
      <ContenidoFormulario repuestoId={repuestoId} categorias={categorias} onGuardado={onGuardado} />
    </Dialogo>
  );
}
