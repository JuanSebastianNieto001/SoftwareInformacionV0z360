"use client";

// La firma del asesor sobre su retroalimentación: lee, comenta si quiere,
// marca la conformidad y firma. La base comprueba que firma el evaluado y
// que hay al menos un compromiso.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { firmarRetroalimentacion } from "@/app/acciones/calidad";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function FirmaRetro({ retroId }: { retroId: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [comentarios, setComentarios] = useState("");
  const [conforme, setConforme] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function firmar() {
    setError(null);
    iniciar(async () => {
      const r = await firmarRetroalimentacion({ retro_id: retroId, comentarios: comentarios || null });
      if (!r.ok) return setError(r.error);
      toast.success("Retroalimentación firmada");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-[16px] border border-primary/40 bg-tinte p-4">
      <div className="space-y-1.5">
        <Label htmlFor={`fc-${retroId}`}>
          Tus comentarios <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <Textarea id={`fc-${retroId}`} value={comentarios} onChange={(e) => setComentarios(e.target.value)} rows={3} maxLength={2000} disabled={pendiente} placeholder="Lo que quieras dejar escrito sobre la sesión o los compromisos" />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={conforme} onCheckedChange={(v) => setConforme(v === true)} disabled={pendiente} className="mt-0.5" />
        <span>Leí la retroalimentación y acepto los compromisos de mejora. Esta aceptación queda registrada con fecha y hora.</span>
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={firmar} disabled={!conforme || pendiente}>
        {pendiente ? <Loader2 className="animate-spin" /> : <PenLine />} Firmar
      </Button>
    </div>
  );
}
