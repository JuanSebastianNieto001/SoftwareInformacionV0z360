"use client";

// Activar / desactivar a una persona de la estructura en un clic, para
// depurar rápido a quien ya salió de la compañía. No borra nada: las
// auditorías históricas quedan; la persona solo desaparece de los
// buscadores de auditoría y feedback nuevos.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, UserCheck, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { alternarActivoAsesor } from "@/app/acciones/calidad";
import { Button } from "@/components/ui/button";

export function BotonActivoAsesor({ id, nombre, activo }: { id: string; nombre: string; activo: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  function alternar() {
    iniciar(async () => {
      const r = await alternarActivoAsesor(id, !activo);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(activo ? `${nombre} quedó inactivo: ya no aparecerá en auditorías ni feedback nuevos` : `${nombre} reactivado`);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={activo ? "text-muted-foreground hover:text-destructive" : "text-muted-foreground hover:text-emerald-700"}
      onClick={alternar}
      disabled={pendiente}
    >
      {pendiente ? <Loader2 className="animate-spin" /> : activo ? <UserMinus /> : <UserCheck />}
      {activo ? "Desactivar" : "Reactivar"}
    </Button>
  );
}
