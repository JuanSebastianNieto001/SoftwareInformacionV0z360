"use client";

// Publicar auditorías guardadas como borrador: una por una desde la lista,
// o todas las propias de un tirón. La base valida cada una (pauta completa,
// pesos en 100) y dice cuáles no pudieron publicarse y por qué.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCheck, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { publicarBorradores } from "@/app/acciones/calidad";
import { Button } from "@/components/ui/button";

function avisar(r: Awaited<ReturnType<typeof publicarBorradores>>) {
  if (!r.ok) {
    toast.error(r.error);
    return;
  }
  if (r.publicadas > 0) {
    toast.success(r.publicadas === 1 ? "Auditoría publicada: el asesor ya puede verla" : `${r.publicadas} auditorías publicadas`);
  }
  for (const f of r.fallidas) {
    toast.error(`No se publicó la de ${f.asesor}`, { description: f.motivo, duration: 10000 });
  }
  if (r.publicadas === 0 && r.fallidas.length === 0) toast("No había borradores por publicar");
}

export function BotonPublicarUna({ id }: { id: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pendiente}
      onClick={() =>
        iniciar(async () => {
          avisar(await publicarBorradores([id]));
          router.refresh();
        })
      }
    >
      {pendiente ? <Loader2 className="animate-spin" /> : <Send />} Publicar
    </Button>
  );
}

export function BotonPublicarLote({ cantidad }: { cantidad: number }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  if (cantidad === 0) return null;
  return (
    <Button
      type="button"
      disabled={pendiente}
      onClick={() =>
        iniciar(async () => {
          avisar(await publicarBorradores());
          router.refresh();
        })
      }
    >
      {pendiente ? <Loader2 className="animate-spin" /> : <CheckCheck />} Publicar mis borradores ({cantidad})
    </Button>
  );
}
