"use client";

// Formulario para registrar o editar un feedback: motivo del catálogo (tipo ·
// subtipo · detalle), colaborador y los campos del documento (gravedad,
// severidad, plan de acción y fecha de seguimiento).
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { actualizarFeedback, crearFeedback } from "@/app/acciones/feedback";
import { SELECT_FEEDBACK } from "@/components/feedback/nav-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ETIQUETA_GRAVEDAD, ETIQUETA_SEVERIDAD, GRAVEDADES, SEVERIDADES } from "@/lib/feedback";
import { hoyIso } from "@/lib/formato";
import type { CatalogoFeedback, Feedback, FeedbackGravedad, FeedbackSeveridad } from "@/lib/supabase/tipos";
import { esquemaFeedback, primerError } from "@/lib/validaciones";

type Asesor = { nombre: string; team_leader: string | null };

export function FormularioFeedback({
  catalogo,
  asesores,
  feedback,
}: {
  catalogo: CatalogoFeedback[];
  asesores: Asesor[];
  feedback?: Feedback;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    catalogo_id: feedback?.catalogo_id ?? "",
    colaborador_nombre: feedback?.colaborador_nombre ?? "",
    team_leader: feedback?.team_leader ?? "",
    fecha: feedback?.fecha ?? hoyIso(),
    gravedad: (feedback?.gravedad ?? "moderado") as FeedbackGravedad,
    severidad: (feedback?.severidad ?? "plan_accion") as FeedbackSeveridad,
    descripcion: feedback?.descripcion ?? "",
    plan_accion: feedback?.plan_accion ?? "",
    fecha_seguimiento: feedback?.fecha_seguimiento ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  // Catálogo agrupado por "Tipo — Subtipo" para los optgroup.
  const grupos = useMemo(() => {
    const m = new Map<string, CatalogoFeedback[]>();
    for (const c of catalogo) {
      const k = `${c.tipo} — ${c.subtipo}`;
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m.entries()];
  }, [catalogo]);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = esquemaFeedback.safeParse(f);
    if (!parsed.success) {
      setError(primerError(parsed.error));
      return;
    }
    iniciar(async () => {
      const r = feedback ? await actualizarFeedback(feedback.id, f) : await crearFeedback(f);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(feedback ? "Feedback actualizado" : "Feedback registrado");
      router.push(r.id ? `/feedback/${r.id}` : "/feedback");
      router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} className="max-w-2xl space-y-5" noValidate>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="space-y-1.5">
        <Label htmlFor="f-motivo">Motivo del feedback</Label>
        <select id="f-motivo" value={f.catalogo_id} onChange={(e) => set("catalogo_id", e.target.value)} className={SELECT_FEEDBACK} disabled={pendiente}>
          <option value="">Elige el tipo, subtipo y detalle…</option>
          {grupos.map(([grupo, items]) => (
            <optgroup key={grupo} label={grupo}>
              {items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.detalle}
                  {c.es_positivo ? " (reconocimiento)" : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="f-colab">Colaborador</Label>
          <Input
            id="f-colab"
            list="feedback-asesores"
            value={f.colaborador_nombre}
            onChange={(e) => {
              const v = e.target.value;
              const a = asesores.find((x) => x.nombre.toLowerCase() === v.trim().toLowerCase());
              setF((p) => ({ ...p, colaborador_nombre: v, team_leader: a?.team_leader ?? p.team_leader }));
            }}
            placeholder="Nombre completo"
            maxLength={160}
            disabled={pendiente}
          />
          <datalist id="feedback-asesores">
            {asesores.map((a) => (
              <option key={a.nombre} value={a.nombre} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-fecha">Fecha del hecho</Label>
          <Input id="f-fecha" type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} disabled={pendiente} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="f-tl">
          Team leader <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <Input id="f-tl" value={f.team_leader} onChange={(e) => set("team_leader", e.target.value)} maxLength={160} disabled={pendiente} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="f-gravedad">Gravedad</Label>
          <select id="f-gravedad" value={f.gravedad} onChange={(e) => set("gravedad", e.target.value as FeedbackGravedad)} className={SELECT_FEEDBACK} disabled={pendiente}>
            {GRAVEDADES.map((g) => (
              <option key={g} value={g}>
                {ETIQUETA_GRAVEDAD[g]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-severidad">Acción requerida</Label>
          <select id="f-severidad" value={f.severidad} onChange={(e) => set("severidad", e.target.value as FeedbackSeveridad)} className={SELECT_FEEDBACK} disabled={pendiente}>
            {SEVERIDADES.map((s) => (
              <option key={s} value={s}>
                {ETIQUETA_SEVERIDAD[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="f-desc">Descripción de los hechos</Label>
        <Textarea id="f-desc" value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} rows={4} maxLength={4000} disabled={pendiente} placeholder="Qué pasó, con datos concretos (fecha, interacción, indicador)" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="f-plan">
          Compromiso / plan de acción <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <Textarea id="f-plan" value={f.plan_accion} onChange={(e) => set("plan_accion", e.target.value)} rows={3} maxLength={4000} disabled={pendiente} placeholder="Lo que el colaborador se compromete a hacer" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="f-seg">
          Fecha de seguimiento <span className="text-muted-foreground">(opcional, genera alerta)</span>
        </Label>
        <Input id="f-seg" type="date" value={f.fecha_seguimiento} onChange={(e) => set("fecha_seguimiento", e.target.value)} className="sm:w-56" disabled={pendiente} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente && <Loader2 className="animate-spin" />}
          {feedback ? "Guardar cambios" : "Registrar feedback"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pendiente}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
