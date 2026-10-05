"use client";

// Botón de borrado con confirmación, compartido por los módulos.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Resultado } from "@/app/acciones/evaluacion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Botón de borrado con confirmación. Recibe la acción ya ligada al id
 * (`eliminarX.bind(null, id)`) para que la página de servidor decida qué
 * se borra y este componente solo pregunte.
 */
export function BotonEliminar({
  accion,
  titulo,
  descripcion,
  volverA,
  compacto = false,
}: {
  accion: () => Promise<Resultado>;
  titulo: string;
  descripcion: string;
  /** Si se indica, tras borrar se navega aquí en lugar de refrescar. */
  volverA?: string;
  compacto?: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  function confirmar() {
    iniciar(async () => {
      const r = await accion();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Eliminado");
      if (volverA) router.push(volverA);
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {compacto ? (
          <Button variant="ghost" size="icon-sm" aria-label={titulo} disabled={pendiente}>
            {pendiente ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        ) : (
          <Button variant="outline" disabled={pendiente}>
            {pendiente ? <Loader2 className="animate-spin" /> : <Trash2 />} Eliminar
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descripcion}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={confirmar}>Eliminar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
