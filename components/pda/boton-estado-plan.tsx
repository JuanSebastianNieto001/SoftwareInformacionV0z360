"use client";

// Cerrar o reabrir el PDA del mes.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { cambiarEstadoPlan } from "@/app/acciones/pda";
import { Button } from "@/components/ui/button";

/** Cerrar congela los resultados del mes; reabrir permite corregirlos. */
export function BotonEstadoPlan({ id, cerrado }: { id: string; cerrado: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  function cambiar() {
    iniciar(async () => {
      const r = await cambiarEstadoPlan(id, !cerrado);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(cerrado ? "PDA reabierto" : "PDA cerrado: resultados congelados");
      router.refresh();
    });
  }

  return (
    <Button variant="outline" disabled={pendiente} onClick={cambiar}>
      {pendiente ? <Loader2 className="animate-spin" /> : cerrado ? <LockOpen /> : <Lock />}
      {cerrado ? "Reabrir" : "Cerrar mes"}
    </Button>
  );
}
