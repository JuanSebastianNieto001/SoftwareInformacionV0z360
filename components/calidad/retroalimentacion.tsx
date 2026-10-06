"use client";

// La sesión de retroalimentación de una auditoría: fortalezas,
// oportunidades y los compromisos con fecha. La abre y la lleva quien tiene
// edición; la firma solo el asesor, desde su propia pantalla.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, MessageSquarePlus, Plus, Save, Trash2 } from "lucide-react";
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
      <div className="rounded-[20px] border border-dashed bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Esta auditoría todavía no tiene sesión de retroalimentación.</p>
        {puedeEditar && (
          <Button className="mt-3" onClick={abrir} disabled={pendiente}>
            {pendiente ? <Loader2 className="animate-spin" /> : <MessageSquarePlus />} Abrir retroalimentación
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-[24px] border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Sesión realizada por {retro.realizada_por_nombre}</p>
          <p className="text-xs text-muted-foreground">
            Abierta {formatearFechaHora(retro.creado_en)}
            {retro.firmada_en ? ` · Firmada ${formatearFechaHora(retro.firmada_en)}` : ""}
          </p>
        </div>
        <Badge variant={firmada ? "default" : retro.estado === "en_proceso" ? "secondary" : "outline"}>
          {firmada && <CheckCircle2 className="mr-1 size-3" />}
          {ETIQUETA_ESTADO_RETRO[retro.estado]}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="r-fort">Fortalezas</Label>
          <Textarea id="r-fort" value={f.fortalezas} onChange={(e) => setF((p) => ({ ...p, fortalezas: e.target.value }))} rows={4} maxLength={4000} disabled={!editable || pendiente} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r-op">Oportunidades de mejora</Label>
          <Textarea id="r-op" value={f.oportunidades} onChange={(e) => setF((p) => ({ ...p, oportunidades: e.target.value }))} rows={4} maxLength={4000} disabled={!editable || pendiente} />
        </div>
      </div>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">Compromisos de mejora</h4>
        {compromisos.length === 0 && <p className="text-sm text-muted-foreground">Sin compromisos. Para firmar hace falta al menos uno.</p>}
        <ul className="space-y-2">
          {compromisos.map((c) => {
            const vencido = c.fecha_limite < hoyIso() && (c.estado === "pendiente" || c.estado === "en_seguimiento");
            return (
              <li key={c.id} className={cn("flex flex-wrap items-start gap-3 rounded-[16px] border p-3", vencido && "border-amber-300 bg-amber-50")}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{c.descripcion}</p>
                  <p className="text-xs text-muted-foreground">
                    Límite {formatearFecha(c.fecha_limite)}
                    {vencido ? " · vencido" : ""}
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
                  <Button variant="ghost" size="icon-sm" aria-label="Quitar compromiso" onClick={() => borrar(c)} disabled={pendiente}>
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {editable && (
          <div className="grid gap-2 rounded-[16px] border border-dashed p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
            <Input value={nuevo.descripcion} onChange={(e) => setNuevo((p) => ({ ...p, descripcion: e.target.value }))} placeholder="Compromiso concreto (qué va a hacer el asesor)" maxLength={500} disabled={pendiente} />
            <Input type="date" value={nuevo.fecha_limite} onChange={(e) => setNuevo((p) => ({ ...p, fecha_limite: e.target.value }))} disabled={pendiente} aria-label="Fecha límite" />
            <Button variant="outline" onClick={agregar} disabled={pendiente || nuevo.descripcion.trim().length < 5 || !nuevo.fecha_limite}>
              <Plus /> Agregar
            </Button>
          </div>
        )}
      </section>

      {retro.comentarios_asesor && (
        <div className="rounded-[16px] bg-tinte p-3 text-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Comentario del asesor</p>
          <p className="mt-1">{retro.comentarios_asesor}</p>
        </div>
      )}

      {editable && (
        <div className="flex flex-wrap items-center gap-3">
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
