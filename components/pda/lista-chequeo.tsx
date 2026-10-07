"use client";

// La lista de chequeo de un objetivo: actividades con fecha límite que se
// van marcando durante el mes. Marcar es un clic; quién y cuándo lo anota
// la base.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { crearTarea, eliminarTarea, marcarTarea } from "@/app/acciones/pda";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatearFecha, hoyIso } from "@/lib/formato";
import type { TareaPda } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";
import { esquemaTareaPda, primerError } from "@/lib/validaciones";

export function ListaChequeo({
  planId,
  objetivoId,
  tareas,
  editable,
  nombres,
}: {
  planId: string;
  objetivoId: string;
  tareas: TareaPda[];
  editable: boolean;
  /** id de perfil → nombre, para decir quién marcó. */
  nombres: Record<string, string>;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [fecha, setFecha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hoy = hoyIso();

  function alternar(t: TareaPda) {
    setOcupada(t.id);
    iniciar(async () => {
      const r = await marcarTarea(t.id, planId, !t.completada);
      setOcupada(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  function borrar(t: TareaPda) {
    setOcupada(t.id);
    iniciar(async () => {
      const r = await eliminarTarea(t.id, planId);
      setOcupada(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  function agregar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const datos = { descripcion, fecha_limite: fecha, orden: tareas.length };
    const parsed = esquemaTareaPda.safeParse(datos);
    if (!parsed.success) {
      setError(primerError(parsed.error));
      return;
    }
    iniciar(async () => {
      const r = await crearTarea(objetivoId, planId, datos);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDescripcion("");
      setFecha("");
      router.refresh();
    });
  }

  const hechas = tareas.filter((t) => t.completada).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Lista de chequeo
          {tareas.length > 0 && (
            <span className="ml-2 font-normal normal-case tracking-normal tabular-nums">
              {hechas} de {tareas.length}
            </span>
          )}
        </p>
        {editable && !agregando && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setAgregando(true)}>
            <Plus /> Actividad
          </Button>
        )}
      </div>

      {tareas.length === 0 && !agregando && (
        <p className="text-sm text-muted-foreground">
          {editable ? "Sin actividades todavía. Agrega las que marcarás durante el mes." : "Sin actividades registradas."}
        </p>
      )}

      {tareas.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {tareas.map((t) => {
            const vencida = !t.completada && !!t.fecha_limite && t.fecha_limite < hoy;
            const trabajando = pendiente && ocupada === t.id;
            const id = `t-${t.id}`;
            return (
              <li key={t.id} className="flex items-start gap-3 px-3 py-2">
                <Checkbox
                  id={id}
                  checked={t.completada}
                  onCheckedChange={() => alternar(t)}
                  disabled={!editable || trabajando}
                  className="mt-0.5"
                  aria-label={t.completada ? `Desmarcar: ${t.descripcion}` : `Marcar como hecha: ${t.descripcion}`}
                />
                <label htmlFor={id} className={cn("min-w-0 flex-1 cursor-pointer text-sm", t.completada && "text-muted-foreground line-through")}>
                  {t.descripcion}
                  <span className="mt-0.5 block text-xs text-muted-foreground no-underline">
                    {t.fecha_limite && (
                      <span className={cn(vencida && "inline-flex items-center gap-1 font-medium text-red-700")}>
                        {vencida && <AlertTriangle className="size-3" aria-hidden />}
                        Límite {formatearFecha(`${t.fecha_limite}T12:00:00-05:00`)}
                      </span>
                    )}
                    {t.completada && t.completada_en && (
                      <>
                        {t.fecha_limite && " · "}
                        Hecha {formatearFecha(t.completada_en)}
                        {t.completada_por && nombres[t.completada_por] && ` por ${nombres[t.completada_por]}`}
                      </>
                    )}
                    {t.observacion && ` · ${t.observacion}`}
                  </span>
                </label>
                {trabajando && <Loader2 className="mt-0.5 size-4 animate-spin text-muted-foreground" aria-hidden />}
                {editable && !trabajando && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="-my-1 text-muted-foreground"
                    onClick={() => borrar(t)}
                    aria-label={`Quitar actividad: ${t.descripcion}`}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editable && agregando && (
        <form onSubmit={agregar} className="flex flex-wrap items-start gap-2 rounded-lg border border-dashed bg-muted/30 p-2" noValidate>
          <Input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Actividad (ej.: Instalar la tarea programada en el servidor)"
            maxLength={500}
            className="min-w-56 flex-1"
            autoFocus
            disabled={pendiente}
          />
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-40" aria-label="Fecha límite" disabled={pendiente} />
          <Button type="submit" size="sm" disabled={pendiente}>
            {pendiente && !ocupada ? <Loader2 className="animate-spin" /> : <Plus />} Agregar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAgregando(false)} disabled={pendiente}>
            Listo
          </Button>
          {error && <p className="w-full text-xs text-destructive">{error}</p>}
        </form>
      )}
    </div>
  );
}
