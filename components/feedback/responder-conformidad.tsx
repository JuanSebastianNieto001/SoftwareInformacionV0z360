"use client";

// La respuesta de conformidad del colaborador que recibe el feedback (o de
// quien hace la sesión, durante la reunión). La fecha y hora las sella la base.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { responderConformidad } from "@/app/acciones/feedback";
import { SELECT_FEEDBACK } from "@/components/feedback/nav-feedback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONFORMIDADES, ETIQUETA_CONFORMIDAD } from "@/lib/feedback";
import type { FeedbackConformidad } from "@/lib/supabase/tipos";

export function ResponderConformidad({ id, enNombreDelColaborador = false }: { id: string; enNombreDelColaborador?: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [conformidad, setConformidad] = useState<FeedbackConformidad | "">("");
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);

  function enviar() {
    setError(null);
    if (!conformidad) {
      setError("Elige tu conformidad.");
      return;
    }
    iniciar(async () => {
      const r = await responderConformidad({ id, conformidad, comentario: comentario || null });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success("Conformidad registrada");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-[16px] border border-primary/40 bg-tinte p-4">
      <p className="text-sm font-medium">{enNombreDelColaborador ? "Registrar la conformidad del colaborador" : "Tu conformidad con este feedback"}</p>
      <div className="space-y-1.5">
        <Label htmlFor={`c-${id}`}>Respuesta</Label>
        <select id={`c-${id}`} value={conformidad} onChange={(e) => setConformidad(e.target.value as FeedbackConformidad)} className={SELECT_FEEDBACK} disabled={pendiente}>
          <option value="">Elige…</option>
          {CONFORMIDADES.map((c) => (
            <option key={c} value={c}>
              {ETIQUETA_CONFORMIDAD[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`cc-${id}`}>
          Comentario o descargo <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <Textarea id={`cc-${id}`} value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} maxLength={2000} disabled={pendiente} placeholder="Aclaración, acuerdo o motivo de la disputa" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={enviar} disabled={pendiente || !conformidad}>
        {pendiente ? <Loader2 className="animate-spin" /> : <PenLine />} Registrar conformidad
      </Button>
    </div>
  );
}
