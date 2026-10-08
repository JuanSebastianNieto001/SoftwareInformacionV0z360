"use client";

// La pauta de calidad de una auditoría: cada ítem con Cumple / No cumple /
// No aplica y el hallazgo cuando no cumple. La nota se recalcula al marcar,
// con la misma fórmula que la vista de la base.
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { guardarRespuestasCalidad, publicarAuditoria } from "@/app/acciones/calidad";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ETIQUETA_RESULTADO, RESULTADOS, calcularNota, formatearPorcentaje, varianteNotaCalidad } from "@/lib/calidad";
import type { CalidadResultado, ItemCalidad } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";
import { esquemaRespuestasCalidad, primerError } from "@/lib/validaciones";

type Props = {
  evaluacionId: string;
  items: ItemCalidad[];
  respuestas: { item_id: string; resultado: CalidadResultado; hallazgo: string | null }[];
  errorFatalAnula: boolean;
  notaMinima: number;
  editable: boolean;
};

export function PautaAuditoria({ evaluacionId, items, respuestas, errorFatalAnula, notaMinima, editable }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [marcas, setMarcas] = useState<Record<string, CalidadResultado | undefined>>(() =>
    Object.fromEntries(respuestas.map((r) => [r.item_id, r.resultado])),
  );
  const [hallazgos, setHallazgos] = useState<Record<string, string>>(() =>
    Object.fromEntries(respuestas.filter((r) => r.hallazgo).map((r) => [r.item_id, r.hallazgo as string])),
  );
  const [sucio, setSucio] = useState(false);

  const activos = useMemo(() => items.filter((i) => i.activo), [items]);
  const categorias = useMemo(() => [...new Set(activos.map((i) => i.categoria))], [activos]);
  const nota = useMemo(
    () => calcularNota(items.map((i) => ({ ...i, peso: Number(i.peso) })), marcas, errorFatalAnula),
    [items, marcas, errorFatalAnula],
  );
  const completa = nota.respondidos === nota.total;

  function marcar(id: string, r: CalidadResultado) {
    setMarcas((p) => ({ ...p, [id]: p[id] === r ? undefined : r }));
    setSucio(true);
  }

  function recoger() {
    return {
      evaluacion_id: evaluacionId,
      respuestas: activos.map((i) => ({
        item_id: i.id,
        resultado: marcas[i.id] ?? null,
        hallazgo: hallazgos[i.id] || null,
      })),
    };
  }

  function guardar(despues?: () => Promise<void>) {
    setError(null);
    const parsed = esquemaRespuestasCalidad.safeParse(recoger());
    if (!parsed.success) return setError(primerError(parsed.error));
    iniciar(async () => {
      const r = await guardarRespuestasCalidad(parsed.data);
      if (!r.ok) return setError(r.error);
      setSucio(false);
      if (despues) await despues();
      else {
        // Guardada como borrador: a la lista de borradores con esta resaltada,
        // donde se publica una por una o todas de un tirón.
        toast.success("Auditoría guardada como borrador. Publícala desde aquí cuando esté lista.");
        router.push(`/calidad/evaluaciones?estado=borrador&nueva=${evaluacionId}`);
        router.refresh();
      }
    });
  }

  function publicar() {
    if (!completa) return setError("Faltan ítems por marcar.");
    guardar(async () => {
      const r = await publicarAuditoria(evaluacionId);
      if (!r.ok) return setError(r.error);
      toast.success("Auditoría publicada: el asesor ya puede verla");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!editable && (
        <Alert>
          <AlertCircle className="size-4" />
          <AlertTitle>Pauta de solo lectura</AlertTitle>
          <AlertDescription>
            Esta auditoría está publicada y su pauta queda congelada (las importadas del formulario anterior llegan ya
            publicadas). Para marcar los ítems, crea una auditoría nueva desde «Nueva auditoría»: allí los botones de
            Cumple / No cumple / No aplica quedan activos mientras es borrador.
          </AlertDescription>
        </Alert>
      )}

      {/* Marcador en vivo */}
      <div className="flex flex-wrap items-center gap-4 rounded-[20px] border bg-card px-5 py-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Nota final</p>
          <p className="text-[34px] leading-none font-semibold tabular-nums">{formatearPorcentaje(nota.notaFinal)}</p>
        </div>
        <div className="text-sm text-muted-foreground">
          <p>
            Sin errores críticos: <span className="font-medium text-foreground">{formatearPorcentaje(nota.notaSinIc)}</span>
          </p>
          <p>
            {nota.respondidos} de {nota.total} ítems marcados · umbral {formatearPorcentaje(notaMinima)}
          </p>
        </div>
        {nota.notaFinal !== null && (
          <Badge className="ml-auto" variant={varianteNotaCalidad(nota.notaFinal, notaMinima)}>
            {nota.notaFinal >= notaMinima ? "Aprobada" : "No aprobada"}
          </Badge>
        )}
      </div>

      {nota.fatalesFallados > 0 && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>Error crítico marcado</AlertTitle>
          <AlertDescription>
            {errorFatalAnula
              ? "La pauta anula la nota cuando falla un error crítico: la nota final es 0 aunque el resto cumpla."
              : "Esta pauta no anula la nota por errores críticos; queda registrado como hallazgo."}
          </AlertDescription>
        </Alert>
      )}

      {categorias.map((cat) => (
        <section key={cat} className="overflow-hidden rounded-[20px] border bg-card">
          <h3 className="bg-zona/60 px-5 py-2.5 text-xs font-semibold tracking-[0.1em] text-marino uppercase">{cat}</h3>
          <ul className="divide-y">
            {activos
              .filter((i) => i.categoria === cat)
              .map((i) => {
                const r = marcas[i.id];
                return (
                  <li key={i.id} className="grid gap-3 px-5 py-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <p className="text-sm leading-snug">
                        {i.descripcion}
                        {i.es_fatal ? (
                          <Badge variant="destructive" className="ml-2 align-middle">
                            crítico
                          </Badge>
                        ) : (
                          <span className="ml-2 text-xs text-muted-foreground tabular-nums">{Number(i.peso)} %</span>
                        )}
                      </p>
                      {r === "no_cumple" && (
                        <Textarea
                          aria-label={`Hallazgo: ${i.descripcion}`}
                          value={hallazgos[i.id] ?? ""}
                          onChange={(e) => {
                            setHallazgos((p) => ({ ...p, [i.id]: e.target.value }));
                            setSucio(true);
                          }}
                          disabled={!editable || pendiente}
                          rows={2}
                          maxLength={1000}
                          placeholder="Hallazgo: qué se observó y en qué minuto"
                          className="mt-2 text-[13px]"
                        />
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={i.descripcion}>
                      {RESULTADOS.map((op) => (
                        <button
                          key={op}
                          type="button"
                          role="radio"
                          aria-checked={r === op}
                          disabled={!editable || pendiente}
                          onClick={() => marcar(i.id, op)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors disabled:opacity-70",
                            r === op
                              ? op === "cumple"
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : op === "no_cumple"
                                  ? "border-destructive bg-destructive text-white"
                                  : "border-slate-500 bg-slate-500 text-white"
                              : "bg-card text-muted-foreground hover:border-borde-acento hover:text-foreground",
                          )}
                        >
                          {ETIQUETA_RESULTADO[op]}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" onClick={() => guardar()} disabled={!sucio || pendiente}>
            {pendiente ? <Loader2 className="animate-spin" /> : <Save />} Guardar borrador
          </Button>
          <Button size="lg" variant="outline" onClick={publicar} disabled={pendiente || !completa}>
            <CheckCircle2 /> Publicar
          </Button>
          {!completa && <span className="text-xs text-muted-foreground">Para publicar hay que marcar todos los ítems.</span>}
          {sucio && <span className="text-xs text-amber-700">Cambios sin guardar.</span>}
        </div>
      )}
    </div>
  );
}
