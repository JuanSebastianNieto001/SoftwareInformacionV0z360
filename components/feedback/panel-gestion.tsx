"use client";

// Gestión del cuadro sobre un feedback: estado, plan de acción y fecha de
// seguimiento. La conformidad se registra aparte (ResponderConformidad).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { gestionarFeedback } from "@/app/acciones/feedback";
import { SELECT_FEEDBACK } from "@/components/feedback/nav-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ESTADOS_FEEDBACK, ETIQUETA_ESTADO_FEEDBACK } from "@/lib/feedback";
import type { FeedbackConCatalogo, FeedbackEstado } from "@/lib/supabase/tipos";

export function PanelGestion({ feedback }: { feedback: FeedbackConCatalogo }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [estado, setEstado] = useState<FeedbackEstado>(feedback.estado);
  const [plan, setPlan] = useState(feedback.plan_accion ?? "");
  const [seguimiento, setSeguimiento] = useState(feedback.fecha_seguimiento ?? "");
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await gestionarFeedback(feedback.id, { estado, plan_accion: plan || null, fecha_seguimiento: seguimiento || null });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success("Feedback actualizado");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-[18px] border bg-card p-4">
      <p className="text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">Gestión y seguimiento</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="g-estado">Estado</Label>
          <select id="g-estado" value={estado} onChange={(e) => setEstado(e.target.value as FeedbackEstado)} className={SELECT_FEEDBACK} disabled={pendiente}>
            {ESTADOS_FEEDBACK.map((s) => (
              <option key={s} value={s}>
                {ETIQUETA_ESTADO_FEEDBACK[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="g-seg">Fecha de seguimiento</Label>
          <Input id="g-seg" type="date" value={seguimiento} onChange={(e) => setSeguimiento(e.target.value)} disabled={pendiente} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-plan">Compromiso / plan de acción</Label>
        <Textarea id="g-plan" value={plan} onChange={(e) => setPlan(e.target.value)} rows={3} maxLength={4000} disabled={pendiente} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={guardar} disabled={pendiente}>
        {pendiente ? <Loader2 className="animate-spin" /> : <Save />} Guardar
      </Button>
    </div>
  );
}
