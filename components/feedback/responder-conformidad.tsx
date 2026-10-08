"use client";

// La firma virtual del feedback: el colaborador marca que lo leyó, elige su
// respuesta (aceptar, aceptar con observaciones o disputar) y firma. La base
// sella fecha y hora y deja rastro en la auditoría; también puede registrarla
// quien hace la sesión, en nombre del colaborador que respondió en persona.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, MessageSquareText, PenLine, XCircle } from "lucide-react";
import { toast } from "sonner";
import { responderConformidad } from "@/app/acciones/feedback";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ETIQUETA_CONFORMIDAD } from "@/lib/feedback";
import type { FeedbackConformidad } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

const OPCIONES: { valor: FeedbackConformidad; icono: typeof CheckCircle2; ayuda: string }[] = [
  { valor: "aceptado", icono: CheckCircle2, ayuda: "Estás de acuerdo con el feedback y el plan de acción." },
  { valor: "observaciones", icono: MessageSquareText, ayuda: "Lo aceptas, pero dejas un comentario o aclaración." },
  { valor: "rechazado", icono: XCircle, ayuda: "No estás de acuerdo: se abre la disputa para revisión." },
];

export function ResponderConformidad({ id, enNombreDelColaborador = false }: { id: string; enNombreDelColaborador?: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [leido, setLeido] = useState(false);
  const [conformidad, setConformidad] = useState<FeedbackConformidad | "">("");
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);

  function firmar() {
    setError(null);
    if (!conformidad) {
      setError("Elige tu respuesta antes de firmar.");
      return;
    }
    iniciar(async () => {
      const r = await responderConformidad({ id, conformidad, comentario: comentario || null });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success("Feedback firmado");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-[16px] border border-primary/40 bg-tinte p-4">
      <p className="text-sm font-medium">{enNombreDelColaborador ? "Registrar la firma del colaborador" : "Firma este feedback"}</p>

      <div className="grid gap-2" role="radiogroup" aria-label="Tu respuesta al feedback">
        {OPCIONES.map((o) => {
          const activa = conformidad === o.valor;
          const Icono = o.icono;
          return (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => setConformidad(o.valor)}
              disabled={pendiente}
              className={cn(
                "flex items-start gap-2 rounded-xl border-[1.5px] px-3 py-2 text-left text-sm transition-colors",
                activa ? "border-primary bg-card shadow-boton" : "border-input bg-campo hover:border-borde-acento",
              )}
            >
              <Icono className={cn("mt-0.5 size-4 shrink-0", o.valor === "rechazado" ? "text-red-700" : o.valor === "aceptado" ? "text-emerald-700" : "text-primary")} aria-hidden />
              <span>
                <span className="font-medium">{ETIQUETA_CONFORMIDAD[o.valor]}</span>
                <span className="block text-xs text-muted-foreground">{o.ayuda}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`cc-${id}`}>
          Comentario o descargo <span className="text-muted-foreground">(opcional{conformidad === "rechazado" ? ", recomendado al disputar" : ""})</span>
        </Label>
        <Textarea id={`cc-${id}`} value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} maxLength={2000} disabled={pendiente} placeholder="Lo que quieras dejar escrito sobre este feedback" />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={leido} onCheckedChange={(v) => setLeido(v === true)} disabled={pendiente} className="mt-0.5" />
        <span>
          {enNombreDelColaborador
            ? "El colaborador leyó el feedback en la sesión y esta es su respuesta. La firma queda registrada con fecha y hora."
            : "Leí este feedback completo. Mi firma queda registrada con fecha y hora."}
        </span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={firmar} disabled={!leido || !conformidad || pendiente}>
        {pendiente ? <Loader2 className="animate-spin" /> : <PenLine />} {enNombreDelColaborador ? "Registrar firma" : "Firmar feedback"}
      </Button>
    </div>
  );
}
