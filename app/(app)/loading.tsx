import { Loader2 } from "lucide-react";

/**
 * Estado de carga instantáneo de las pantallas del día a día. Todas las
 * páginas se renderizan en el servidor: sin esto, entre el clic a una
 * pestaña y la respuesta no pasaba nada visible y parecía que el clic no
 * había funcionado.
 */
export default function Cargando() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Cargando">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
