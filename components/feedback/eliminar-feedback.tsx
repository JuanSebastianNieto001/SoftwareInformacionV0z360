"use client";

// Eliminar un feedback exige escribir el motivo. Solo aparece para quien
// tiene nivel Total en Feedback (la coordinación de Formación); la base lo
// vuelve a exigir y guarda la foto de lo borrado con el motivo en la
// bitácora que ve el administrador.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { eliminarFeedback } from "@/app/acciones/feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function EliminarFeedback({ id, colaborador }: { id: string; colaborador: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const corto = motivo.trim().length < 10;

  function eliminar() {
    setError(null);
    if (corto) {
      setError("Escribe el motivo (mínimo 10 caracteres).");
      return;
    }
    iniciar(async () => {
      const r = await eliminarFeedback(id, motivo);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success("Feedback eliminado; el motivo quedó en la bitácora");
      setAbierto(false);
      router.push("/feedback");
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 /> Eliminar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar este feedback</DialogTitle>
          <DialogDescription>
            Se borra el feedback de {colaborador}, con su compromiso y su firma. No se puede deshacer: queda registrado quién
            lo eliminó, cuándo y por qué.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`motivo-fb-${id}`}>
            Motivo de la eliminación <span className={corto && motivo ? "text-destructive" : "text-muted-foreground"}>(obligatorio)</span>
          </Label>
          <Textarea
            id={`motivo-fb-${id}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={1000}
            autoFocus
            disabled={pendiente}
            placeholder="Ej.: se registró al colaborador equivocado; el motivo no corresponde a lo ocurrido"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={eliminar} disabled={pendiente || corto}>
            {pendiente ? <Loader2 className="animate-spin" /> : <Trash2 />} Eliminar definitivamente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
