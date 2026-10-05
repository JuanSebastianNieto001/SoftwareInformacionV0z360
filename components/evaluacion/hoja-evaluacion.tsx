"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LockOpen,
  Printer,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import {
  actualizarCabeceraEvaluacion,
  cerrarEvaluacion,
  eliminarEvaluacion,
  guardarCalificaciones,
  reabrirEvaluacion,
} from "@/app/acciones/evaluacion";
import { BotonEliminar } from "@/components/evaluacion/boton-eliminar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  ESCALA_FORMATO,
  ETIQUETA_PERSPECTIVA,
  PERSPECTIVAS_FORMATO,
  TABLA_INTERPRETACION,
  calcularFormato,
  formatearNota,
  nivelFormato,
  varianteNota,
  type MapaCalificaciones,
  type PerspectivaFormato,
} from "@/lib/evaluacion";
import { formatearFechaHora } from "@/lib/formato";
import type { CargoEvaluacion, CriterioEvaluacion, Evaluacion } from "@/lib/supabase/tipos";
import { esquemaCalificaciones, esquemaEvaluacionCabecera, primerError } from "@/lib/validaciones";
import { cn } from "@/lib/utils";

type Props = {
  evaluacion: Evaluacion;
  cargo: CargoEvaluacion;
  criterios: CriterioEvaluacion[];
  calificaciones: { criterio_id: string; perspectiva: string; calificacion: number }[];
  observaciones: { criterio_id: string; observacion: string }[];
  pesos: Record<PerspectivaFormato, number>;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  esAdmin: boolean;
};

type Celdas = Record<string, Record<PerspectivaFormato, string>>;

const INPUT_CELDA =
  "h-9 w-[4.5rem] text-center tabular-nums disabled:opacity-100 disabled:text-foreground";

/**
 * Una hoja de cargo del Excel, celda por celda: 12 criterios × 4
 * perspectivas, el ponderado por criterio (columna K), los promedios de la
 * fila 24 y el nivel (L24). Se recalcula al escribir y se guarda de una
 * vez, como quien guarda el libro.
 *
 * Lo que la hoja no tiene y aquí sí: el estado. Un borrador se edita; una
 * evaluación cerrada queda como está, y solo un administrador la reabre.
 */
export function HojaEvaluacion({
  evaluacion,
  cargo,
  criterios,
  calificaciones,
  observaciones,
  pesos,
  puedeEditar,
  puedeEliminar,
  esAdmin,
}: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const cerrada = evaluacion.estado === "cerrada";
  const editable = puedeEditar && !cerrada;

  // ---- celdas ----
  const [celdas, setCeldas] = useState<Celdas>(() => {
    const base: Celdas = {};
    for (const c of criterios) {
      base[c.id] = { autoevaluacion: "", jefe_inmediato: "", pares: "", subordinados: "" };
    }
    for (const k of calificaciones) {
      const fila = base[k.criterio_id];
      if (fila && k.perspectiva in fila) fila[k.perspectiva as PerspectivaFormato] = String(k.calificacion);
    }
    return base;
  });
  const [obs, setObs] = useState<Record<string, string>>(() =>
    Object.fromEntries(observaciones.map((o) => [o.criterio_id, o.observacion])),
  );
  const [sucio, setSucio] = useState(false);

  const mapa = useMemo<MapaCalificaciones>(() => {
    const m: MapaCalificaciones = {};
    for (const [id, fila] of Object.entries(celdas)) {
      m[id] = {};
      for (const p of PERSPECTIVAS_FORMATO) {
        const v = fila[p].trim();
        m[id][p] = v === "" ? null : Number(v.replace(",", "."));
      }
    }
    return m;
  }, [celdas]);

  const criterioIds = useMemo(() => criterios.map((c) => c.id), [criterios]);
  const resultado = useMemo(() => calcularFormato(criterioIds, mapa, pesos), [criterioIds, mapa, pesos]);
  const nivel = nivelFormato(resultado.nCalificadas > 0 ? resultado.notaFinal : null);

  function escribir(criterioId: string, p: PerspectivaFormato, valor: string) {
    setCeldas((prev) => ({ ...prev, [criterioId]: { ...prev[criterioId], [p]: valor } }));
    setSucio(true);
  }

  /** Lo que se manda al guardar: TODAS las celdas, con null donde está en blanco. */
  function recoger() {
    return {
      evaluacion_id: evaluacion.id,
      calificaciones: criterioIds.flatMap((id) =>
        PERSPECTIVAS_FORMATO.map((p) => ({
          criterio_id: id,
          perspectiva: p,
          calificacion: mapa[id]?.[p] ?? null,
        })),
      ),
      observaciones: criterioIds.map((id) => ({ criterio_id: id, observacion: obs[id] ?? null })),
    };
  }

  function guardar(despues?: () => Promise<void>) {
    setError(null);
    const parsed = esquemaCalificaciones.safeParse(recoger());
    if (!parsed.success) return setError(primerError(parsed.error));
    iniciar(async () => {
      const r = await guardarCalificaciones(parsed.data);
      if (!r.ok) return setError(r.error);
      setSucio(false);
      if (despues) await despues();
      else {
        toast.success("Calificaciones guardadas");
        router.refresh();
      }
    });
  }

  function cerrar() {
    guardar(async () => {
      const r = await cerrarEvaluacion(evaluacion.id);
      if (!r.ok) return setError(r.error);
      toast.success("Evaluación cerrada");
      router.refresh();
    });
  }

  function reabrir() {
    setError(null);
    iniciar(async () => {
      const r = await reabrirEvaluacion(evaluacion.id);
      if (!r.ok) return setError(r.error);
      toast.success("Evaluación reabierta");
      router.refresh();
    });
  }

  // ---- cabecera ----
  const [cab, setCab] = useState({
    evaluado_nombre: evaluacion.evaluado_nombre,
    campana: evaluacion.campana ?? "",
    periodo: evaluacion.periodo,
    fecha_evaluacion: evaluacion.fecha_evaluacion,
    evaluador_nombre: evaluacion.evaluador_nombre,
    evaluador_cargo: evaluacion.evaluador_cargo ?? "",
    plan_accion: evaluacion.plan_accion ?? "",
  });
  const [cabSucia, setCabSucia] = useState(false);
  const setC = <K extends keyof typeof cab>(k: K, v: (typeof cab)[K]) => {
    setCab((prev) => ({ ...prev, [k]: v }));
    setCabSucia(true);
  };

  function guardarCabecera() {
    setError(null);
    const parsed = esquemaEvaluacionCabecera.safeParse({
      ...cab,
      evaluado_id: evaluacion.evaluado_id,
      campana: cab.campana || null,
      evaluador_cargo: cab.evaluador_cargo || null,
      plan_accion: cab.plan_accion || null,
    });
    if (!parsed.success) return setError(primerError(parsed.error));
    iniciar(async () => {
      const r = await actualizarCabeceraEvaluacion(evaluacion.id, parsed.data);
      if (!r.ok) return setError(r.error);
      setCabSucia(false);
      toast.success("Datos de la hoja guardados");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filas 4 y 5 de la hoja */}
      <section className="rounded-[24px] border bg-card p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 lg:col-span-1">
            <Label htmlFor="h-evaluado">Nombre del {cargo.etiqueta_evaluado.toLowerCase()}</Label>
            <Input
              id="h-evaluado"
              value={cab.evaluado_nombre}
              onChange={(e) => setC("evaluado_nombre", e.target.value)}
              disabled={!editable || pendiente}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h-campana">Campaña / cuenta</Label>
            <Input
              id="h-campana"
              value={cab.campana}
              onChange={(e) => setC("campana", e.target.value)}
              disabled={!editable || pendiente}
              maxLength={120}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="h-periodo">Periodo</Label>
              <Input
                id="h-periodo"
                value={cab.periodo}
                onChange={(e) => setC("periodo", e.target.value)}
                disabled={!editable || pendiente}
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="h-fecha">Fecha</Label>
              <Input
                id="h-fecha"
                type="date"
                value={cab.fecha_evaluacion}
                onChange={(e) => setC("fecha_evaluacion", e.target.value)}
                disabled={!editable || pendiente}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h-evaluador">Evaluador</Label>
            <Input
              id="h-evaluador"
              value={cab.evaluador_nombre}
              onChange={(e) => setC("evaluador_nombre", e.target.value)}
              disabled={!editable || pendiente}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h-evaluador-cargo">Cargo del evaluador</Label>
            <Input
              id="h-evaluador-cargo"
              value={cab.evaluador_cargo}
              onChange={(e) => setC("evaluador_cargo", e.target.value)}
              disabled={!editable || pendiente}
              maxLength={120}
            />
          </div>
          {editable && (
            <div className="flex items-end">
              <Button variant="outline" onClick={guardarCabecera} disabled={!cabSucia || pendiente}>
                {pendiente ? <Loader2 className="animate-spin" /> : <Save />} Guardar datos
              </Button>
            </div>
          )}
        </div>

        {/* Fila 8: la escala */}
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          <span className="font-semibold">Escala de calificación (1 a 5):</span>{" "}
          {ESCALA_FORMATO.map((e) => `${e.valor}: ${e.etiqueta}`).join(" | ")}. Admite decimales.
        </p>
      </section>

      {/* Filas 10..24: la rejilla */}
      <section className="overflow-x-auto rounded-[20px] border bg-card">
        <Table className="min-w-[1100px]">
          <TableHeader>
            <TableRow className="bg-marino text-white hover:bg-marino">
              <TableHead className="w-[12rem] text-white">Categoría</TableHead>
              <TableHead className="min-w-[20rem] text-white">Criterio / función evaluada</TableHead>
              {PERSPECTIVAS_FORMATO.map((p) => (
                <TableHead key={p} className="text-center text-white">
                  {ETIQUETA_PERSPECTIVA[p].toUpperCase()}
                  <span className="block text-[11px] font-normal text-white/75">
                    peso {Math.round(pesos[p] * 100)} %
                  </span>
                </TableHead>
              ))}
              <TableHead className="text-right text-white">Puntaje ponderado</TableHead>
              <TableHead className="min-w-[14rem] text-white print:hidden">Observaciones / evidencias</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {criterios.map((c, i) => (
              <TableRow key={c.id} className={i % 2 ? "bg-zona/40" : undefined}>
                <TableCell className="align-top text-[13px] font-medium">{c.categoria}</TableCell>
                <TableCell className="align-top text-[13px] leading-snug whitespace-normal">
                  {c.criterio}
                </TableCell>
                {PERSPECTIVAS_FORMATO.map((p) => {
                  const v = mapa[c.id]?.[p];
                  const fueraDeRango = typeof v === "number" && (v < 1 || v > 5 || !Number.isFinite(v));
                  return (
                    <TableCell key={p} className="text-center align-top">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={1}
                        max={5}
                        step={0.1}
                        aria-label={`${ETIQUETA_PERSPECTIVA[p]}, criterio ${c.orden}`}
                        aria-invalid={fueraDeRango || undefined}
                        value={celdas[c.id]?.[p] ?? ""}
                        onChange={(e) => escribir(c.id, p, e.target.value)}
                        disabled={!editable || pendiente}
                        className={cn(INPUT_CELDA, "mx-auto", fueraDeRango && "border-destructive")}
                      />
                      <span className="mt-1 block text-[11px] tabular-nums text-muted-foreground">
                        {typeof v === "number" && !fueraDeRango ? formatearNota(v * pesos[p]) : "0,00"}
                      </span>
                    </TableCell>
                  );
                })}
                <TableCell className="text-right align-top font-semibold tabular-nums">
                  {formatearNota(resultado.ponderadoPorCriterio[c.id] ?? 0)}
                </TableCell>
                <TableCell className="align-top print:hidden">
                  <Textarea
                    aria-label={`Observaciones, criterio ${c.orden}`}
                    value={obs[c.id] ?? ""}
                    onChange={(e) => {
                      setObs((prev) => ({ ...prev, [c.id]: e.target.value }));
                      setSucio(true);
                    }}
                    disabled={!editable || pendiente}
                    rows={2}
                    maxLength={1000}
                    className="min-h-9 text-[13px]"
                  />
                </TableCell>
              </TableRow>
            ))}

            {/* Fila 24 */}
            <TableRow className="bg-zona/70 font-semibold hover:bg-zona/70">
              <TableCell colSpan={2}>PUNTAJE TOTAL Y PONDERACIÓN</TableCell>
              {PERSPECTIVAS_FORMATO.map((p) => (
                <TableCell key={p} className="text-center tabular-nums">
                  {formatearNota(resultado.promedioPorPerspectiva[p])}
                  <span className="block text-[11px] font-normal text-muted-foreground">promedio</span>
                </TableCell>
              ))}
              <TableCell className="text-right text-base tabular-nums">
                {formatearNota(resultado.nCalificadas > 0 ? resultado.notaFinal : null)}
              </TableCell>
              <TableCell className="print:hidden">
                {nivel && <Badge variant={varianteNota(resultado.notaFinal)}>{nivel}</Badge>}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>

      {resultado.nCalificadas > 0 && resultado.perspectivasIncompletas.length > 0 && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>Faltan calificaciones</AlertTitle>
          <AlertDescription>
            Sin completar: {resultado.perspectivasIncompletas.map((p) => ETIQUETA_PERSPECTIVA[p]).join(", ")}.
            Igual que en la hoja de cálculo, una celda en blanco cuenta 0 en el puntaje ponderado, así
            que la nota final baja hasta que se califiquen todas las perspectivas.
          </AlertDescription>
        </Alert>
      )}

      {/* Resultado + tabla de interpretación (filas 27..32) */}
      <section className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="rounded-[20px] border bg-card p-5">
          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Resultado ponderado
          </p>
          <p className="mt-1 text-[40px] leading-none font-semibold tabular-nums">
            {formatearNota(resultado.nCalificadas > 0 ? resultado.notaFinal : null)}
          </p>
          <p className="mt-2 text-sm">
            {nivel ? (
              <Badge variant={varianteNota(resultado.notaFinal)}>{nivel}</Badge>
            ) : (
              <span className="text-muted-foreground">Sin calificaciones todavía</span>
            )}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            {resultado.nCalificadas} de {criterios.length * PERSPECTIVAS_FORMATO.length} celdas calificadas
          </p>
        </div>

        <div className="overflow-x-auto rounded-[20px] border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rango de puntaje</TableHead>
                <TableHead>Nivel de desempeño</TableHead>
                <TableHead>Acción recomendada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TABLA_INTERPRETACION.map((fila) => (
                <TableRow
                  key={fila.nivel}
                  className={cn(nivel === fila.nivel && "bg-tinte font-medium")}
                  aria-current={nivel === fila.nivel ? "true" : undefined}
                >
                  <TableCell className="tabular-nums">
                    {formatearNota(fila.desde)} – {formatearNota(fila.hasta)}
                  </TableCell>
                  <TableCell>{fila.nivel}</TableCell>
                  <TableCell>{fila.accion}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Filas 34..37 */}
      <section className="space-y-1.5 rounded-[24px] border bg-card p-5 sm:p-6">
        <Label htmlFor="h-plan">Plan de acción y compromisos de mejora</Label>
        <Textarea
          id="h-plan"
          value={cab.plan_accion}
          onChange={(e) => setC("plan_accion", e.target.value)}
          disabled={!editable || pendiente}
          rows={4}
          maxLength={4000}
          placeholder="Compromisos acordados entre el evaluador y el evaluado para el siguiente periodo…"
        />
        {editable && cabSucia && (
          <p className="text-xs text-muted-foreground">Se guarda con «Guardar datos» o al cerrar la evaluación.</p>
        )}
      </section>

      {/* Firmas (filas 40-41): en pantalla, el cierre es la firma */}
      <section className="grid gap-4 text-sm sm:grid-cols-2">
        <div className="rounded-[18px] border border-dashed p-4">
          <p className="text-xs text-muted-foreground">Firma del {cargo.etiqueta_evaluado.toLowerCase()} evaluado</p>
          <p className="mt-1 font-medium">{cab.evaluado_nombre || "—"}</p>
        </div>
        <div className="rounded-[18px] border border-dashed p-4">
          <p className="text-xs text-muted-foreground">Firma del evaluador / jefe inmediato</p>
          <p className="mt-1 font-medium">
            {cab.evaluador_nombre}
            {cab.evaluador_cargo ? ` · ${cab.evaluador_cargo}` : ""}
          </p>
          {cerrada && evaluacion.cerrada_en && (
            <p className="mt-1 text-xs text-muted-foreground">
              Cerrada el {formatearFechaHora(evaluacion.cerrada_en)}
            </p>
          )}
        </div>
      </section>

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {editable && (
          <>
            <Button size="lg" onClick={() => guardar()} disabled={(!sucio && !cabSucia) || pendiente}>
              {pendiente ? <Loader2 className="animate-spin" /> : <Save />} Guardar
            </Button>
            <Button size="lg" variant="outline" onClick={cerrar} disabled={pendiente || resultado.nCalificadas === 0}>
              <CheckCircle2 /> Cerrar evaluación
            </Button>
          </>
        )}
        {cerrada && esAdmin && (
          <Button size="lg" variant="outline" onClick={reabrir} disabled={pendiente}>
            <LockOpen /> Reabrir
          </Button>
        )}
        <Button variant="ghost" onClick={() => window.print()}>
          <Printer /> Imprimir
        </Button>
        {puedeEliminar && (
          <div className="ml-auto">
            <BotonEliminar
              accion={() => eliminarEvaluacion(evaluacion.id)}
              titulo="Eliminar esta evaluación"
              descripcion={`Se borran la hoja de ${evaluacion.evaluado_nombre} (${evaluacion.periodo}) y todas sus calificaciones. Esta acción no se puede deshacer.`}
              volverA="/evaluacion/formatos"
            />
          </div>
        )}
      </div>

      {sucio && editable && (
        <p className="text-xs text-amber-700 print:hidden">Hay cambios sin guardar.</p>
      )}
    </div>
  );
}
