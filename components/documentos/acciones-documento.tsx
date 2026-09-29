"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { llamarApi } from "@/lib/subida-cliente";

/** Botón "Eliminar" (solo admin) con confirmación. Llama a DELETE /api/documentos/[id]. */
export function AccionesDocumento({
  id,
  titulo,
  areaSlug,
  children,
}: {
  id: string;
  titulo: string;
  areaSlug: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function eliminar() {
    setOcupado(true);
    try {
      await llamarApi<{ ok: boolean }>(`/api/documentos/${id}`, { method: "DELETE" });
      toast.success("Documento eliminado");
      router.push(areaSlug ? `/areas/${areaSlug}` : "/");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
      setOcupado(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="lg" variant="destructive" disabled={ocupado}>
          {ocupado ? <Loader2 className="animate-spin" /> : children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar este documento?</AlertDialogTitle>
          <AlertDialogDescription>
            Se borrará el archivo <strong>{titulo}</strong> del almacenamiento y sus metadatos. La
            auditoría conserva el registro de quién lo consultó. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void eliminar();
            }}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Eliminar definitivamente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
