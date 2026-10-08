"use client";

// La sesión de retroalimentación de una auditoría: fortalezas,
// oportunidades y los compromisos con fecha. La abre y la lleva quien tiene
// edición; la firma solo el asesor, desde su propia pantalla.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, CheckCircle2, Lightbulb, Loader2, MessageSquarePlus, MessageSquareQuote, PenLine, Plus, Save, ThumbsUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  abrirRetroalimentacion,
  actualizarCompromiso,
  actualizarRetroalimentacion,
  crearCompromiso,
  eliminarCompromiso,
} from "@/app/acciones/calidad";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ESTADOS_COMPROMISO, ETIQUETA_ESTADO_COMPROMISO, ETIQUETA_ESTADO_RETRO } from "@/lib/calidad";
import { formatearFecha, formatearFechaHora, hoyIso } from "@/lib/formato";
import type { Compromiso, EstadoCompromiso, Retroalimentacion } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

const SELECT =
  "h-[38px] rounded-lg border-[1.5px] border-input bg-campo px-2 text-sm outline-none focus-visible:border-primary";

type Props = {
  evaluacionId: string;
  retro: Retroalimentacion | null;
  compromisos: Compromiso[];
  puedeEditar: boolean;
};

export function PanelRetroalimentacion({ evaluacionId, retro, compromisos, puedeEditar }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const firmada = retro?.estado === "firmada";
  const editable = puedeEditar && !!retro && !firmada;

  const [f, setF] = useState({
    fortalezas: retro?.fortalezas ?? "",
    oportunidades: retro?.oportunidades ?? "",
    estado: (retro?.estado === "firmada" ? "en_proceso" : (retro?.estado ?? "pendiente")) as "pendiente" | "en_proceso",
  });
  const [nuevo, setNuevo] = useState({ descripcion: "", fecha_limite: "" });

  function abrir() {
    iniciar(async () => {
      const r = await abrirRetroalimentacion(evaluacionId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Retroalimentación abierta");
      router.refresh();
    });
  }

  function guardar() {
    if (!retro) return;
    iniciar(async () => {
      const r = await actualizarRetroalimentacion(retro.id, {
        fortalezas: f.fortalezas || null,
        oportunidades: f.oportunidades || null,
        estado: f.estado,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Retroalimentación guardada");
      router.refresh();
    });
  }

  function agregar() {
    if (!retro) return;
    iniciar(async () => {
      const r = await crearCompromiso(retro.id, { ...nuevo, estado: "pendiente", avance: null });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setNuevo({ descripcion: "", fecha_limite: "" });
      router.refresh();
    });
  }

  function cambiarEstado(c: Compromiso, estado: EstadoCompromiso) {
    iniciar(async () => {
      const r = await actualizarCompromiso(c.id, { descripcion: c.descripcion, fecha_limite: c.fecha_limite, estado, avance: c.avance });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  function borrar(c: Compromiso) {
    iniciar(async () => {
      const r = await eliminarCompromiso(c.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  if (!retro) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[24px] border border-dashed bg-card px-6 py-8 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-tinte text-primary">
          <MessageSquarePlus className="size-5" aria-hidden />
        </span>
        <div>
          <p className="font-medium">Sin sesión de retroalimentación</p>
          <p className="mt-0.5 text-sm text-muted-foreground">Ábrela para registrar fortalezas, oportunidades y los compromisos que firmará el asesor.</p>
        </div>
        {puedeEditar && (
          <Button onClick={abrir} disabled={pendiente}>
            {pendiente ? <Loader2 className="animate-spin" /> : <MessageSquarePlus />} Abrir retroalimentación
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[24px] border bg-card">
      {/* Cabecera de la sesión */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-zona/60 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-primary shadow-sm">
            <MessageSquareQuote className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Sesión con {retro.realizada_por_nombre}</p>
            <p className="text-xs text-muted-foreground">
              Abierta {formatearFechaHora(retro.creado_en)}
              {retro.firmada_en ? ` · Firmada ${formatearFechaHora(retro.firmada_en)}` : ""}
            </p>
          </div>
        </div>
        <Badge variant={firmada ? "default" : retro.estado === "en_proceso" ? "secondary" : "outline"} className="text-[12px]">
          {firmada && <CheckCircle2 className="mr-1 size-3" />}
          {ETIQUETA_ESTADO_RETRO[retro.estado]}
        </Badge>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        {/* Fortalezas y oportunidades */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-[18px] border border-emerald-200 bg-emerald-50/60 p-4">
            <Label htmlFor="r-fort" className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.1em] text-emerald-800 uppercase">
              <ThumbsUp className="size-3.5" aria-hidden /> Fortalezas
            </Label>
            <Textarea
              id="r-fort"
              value={f.fortalezas}
              onChange={(e) => setF((p) => ({ ...p, fortalezas: e.target.value }))}
              rows={4}
              maxLength={4000}
              disabled={!editable || pendiente}
              placeholder="Lo que el asesor hizo bien en la llamada"
              className="bg-card"
            />
          </div>
          <div className="space-y-2 rounded-[18px] border border-amber-200 bg-amber-50/60 p-4">
            <Label htmlFor="r-op" className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.1em] text-amber-800 uppercase">
              <Lightbulb className="size-3.5" aria-hidden /> Oportunidades de mejora
            </Label>
            <Textarea
              id="r-op"
              value={f.oportunidades}
              onChange={(e) => setF((p) => ({ ...p, oportunidades: e.target.value }))}
              rows={4}
              maxLength={4000}
              disabled={!editable || pendiente}
              placeholder="Qué debe mejorar y cómo"
              className="bg-card"
            />
          </div>
        </div>

        {/* Compromisos */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">Compromisos de mejora</h4>
            <span className="text-xs text-muted-foreground tabular-nums">
              {compromisos.length} {compromisos.length === 1 ? "compromiso" : "compromisos"}
            </span>
          </div>
          {compromisos.length === 0 && (
            <p className="rounded-[16px] bg-tinte px-4 py-3 text-sm text-muted-foreground">Sin compromisos todavía. Para que el asesor firme hace falta al menos uno.</p>
          )}
          <ul className="space-y-2">
            {compromisos.map((c) => {
              const vencido = c.fecha_limite < hoyIso() && (c.estado === "pendiente" || c.estado === "en_seguimiento");
              return (
                <li
                  key={c.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-[16px] border bg-card px-4 py-3 shadow-[0_1px_0_rgba(15,23,42,0.03)]",
                    vencido && "border-amber-300 bg-amber-50",
                  )}
                >
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", vencido ? "bg-amber-100 text-amber-800" : "bg-tinte text-primary")}>
                    <CalendarClock className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.descripcion}</p>
                    <p className="text-xs text-muted-foreground">
                      Límite {formatearFecha(c.fecha_limite)}
                      {vencido && <span className="ml-1 font-medium text-amber-800">· vencido</span>}
                      {c.avance ? ` · ${c.avance}` : ""}
                    </p>
                  </div>
                  {puedeEditar ? (
                    <select value={c.estado} onChange={(e) => cambiarEstado(c, e.target.value as EstadoCompromiso)} disabled={pendiente} className={SELECT} aria-label="Estado del compromiso">
                      {ESTADOS_COMPROMISO.map((s) => (
                        <option key={s} value={s}>
                          {ETIQUETA_ESTADO_COMPROMISO[s]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge variant="outline">{ETIQUETA_ESTADO_COMPROMISO[c.estado]}</Badge>
                  )}
                  {editable && (
                    <Button variant="ghost" size="icon-sm" aria-label="Quitar compromiso" onClick={() => borrar(c)} disabled={pendiente} className="text-muted-foreground hover:text-destructive">
                      <Trash2 />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {editable && (
            <div className="grid gap-2 rounded-[16px] border border-dashed bg-zona/40 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
              <Input value={nuevo.descripcion} onChange={(e) => setNuevo((p) => ({ ...p, descripcion: e.target.value }))} placeholder="Compromiso concreto (qué va a hacer el asesor)" maxLength={500} disabled={pendiente} className="bg-card" />
              <Input type="date" value={nuevo.fecha_limite} onChange={(e) => setNuevo((p) => ({ ...p, fecha_limite: e.target.value }))} disabled={pendiente} aria-label="Fecha límite" className="bg-card" />
              <Button variant="outline" onClick={agregar} disabled={pendiente || nuevo.descripcion.trim().length < 5 || !nuevo.fecha_limite}>
                <Plus /> Agregar
              </Button>
            </div>
          )}
        </section>

        {retro.comentarios_asesor && (
          <div className="rounded-[18px] border bg-tinte p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">
              <PenLine className="size-3.5" aria-hidden /> Comentario del asesor al firmar
            </p>
            <p className="mt-1.5 text-sm">{retro.comentarios_asesor}</p>
          </div>
        )}
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-3 border-t bg-zona/40 px-5 py-4 sm:px-6">
          <select value={f.estado} onChange={(e) => setF((p) => ({ ...p, estado: e.target.value as "pendiente" | "en_proceso" }))} className={SELECT} disabled={pendiente} aria-label="Estado de la sesión">
            <option value="pendiente">Pendiente por realizar</option>
            <option value="en_proceso">En proceso (lista para firma)</option>
          </select>
          <Button onClick={guardar} disabled={pendiente}>
            {pendiente ? <Loader2 className="animate-spin" /> : <Save />} Guardar
          </Button>
          <span className="text-xs text-muted-foreground">La firma la pone el asesor desde «Mis evaluaciones».</span>
        </div>
      )}
    </div>
  );
}
