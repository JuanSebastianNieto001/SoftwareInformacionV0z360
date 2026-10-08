"use client";

// Eliminar una auditoría exige escribir el motivo. Solo aparece para quien
// tiene nivel Total en Calidad (la coordinación de Formación); la base lo
// vuelve a exigir y guarda la foto de lo borrado con el motivo en la
// bitácora que ve el administrador.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { eliminarAuditoria } from "@/app/acciones/calidad";
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

export function EliminarAuditoria({ id, asesor, fecha }: { id: string; asesor: string; fecha: string }) {
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
      const r = await eliminarAuditoria(id, motivo);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success("Auditoría eliminada; el motivo quedó en la bitácora");
      setAbierto(false);
      router.push("/calidad/evaluaciones");
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
          <DialogTitle>Eliminar esta auditoría</DialogTitle>
          <DialogDescription>
            Se borra la auditoría de {asesor} del {fecha} con su pauta, retroalimentación y compromisos. No se puede deshacer:
            queda registrado quién la eliminó, cuándo y por qué.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`motivo-${id}`}>
            Motivo de la eliminación <span className={corto && motivo ? "text-destructive" : "text-muted-foreground"}>(obligatorio)</span>
          </Label>
          <Textarea
            id={`motivo-${id}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={1000}
            autoFocus
            disabled={pendiente}
            placeholder="Ej.: se auditó la llamada equivocada; el asesor no corresponde a la grabación"
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
