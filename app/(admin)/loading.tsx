// Carga del grupo (admin): Next.js la muestra mientras la página resuelve sus datos.
import { Loader2 } from "lucide-react";

/** Estado de carga instantáneo del panel de administración (ver app/(app)/loading.tsx). */
export default function Cargando() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Cargando">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
