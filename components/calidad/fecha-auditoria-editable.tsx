"use client";

// La fecha de auditoría, editable en la misma lista por quien hizo la
// auditoría. Se guarda al cambiarla; la base vuelve a exigir que sea su
// auditoría (o un administrador).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cambiarFechaAuditoria } from "@/app/acciones/calidad";
import { cn } from "@/lib/utils";

export function FechaAuditoriaEditable({ id, fecha }: { id: string; fecha: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [valor, setValor] = useState(fecha);

  function guardar(nueva: string) {
    if (!nueva || nueva === fecha) return;
    iniciar(async () => {
      const r = await cambiarFechaAuditoria(id, nueva);
      if (!r.ok) {
        toast.error(r.error);
        setValor(fecha);
        return;
      }
      toast.success("Fecha de auditoría actualizada");
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="date"
        value={valor}
        onChange={(e) => {
          setValor(e.target.value);
          guardar(e.target.value);
        }}
        disabled={pendiente}
        aria-label="Fecha de auditoría (editable)"
        title="Puedes ajustar la fecha de tu auditoría"
        className={cn(
          "h-8 rounded-lg border-[1.5px] border-dashed border-input bg-campo px-2 text-sm tabular-nums outline-none transition-colors",
          "hover:border-primary focus-visible:border-primary focus-visible:bg-card",
        )}
      />
      {pendiente && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />}
    </span>
  );
}
