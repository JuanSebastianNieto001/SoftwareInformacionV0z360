import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EstadoDocumento } from "@/lib/supabase/tipos";
import { diasHasta } from "@/lib/formato";

const ESTILOS: Record<EstadoDocumento, string> = {
  vigente:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  programado:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  vencido:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  purgado:
    "border-neutral-300 bg-neutral-100 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400",
};

export const ETIQUETA_ESTADO: Record<EstadoDocumento, string> = {
  vigente: "Vigente",
  programado: "Programado",
  vencido: "Vencido",
  purgado: "Purgado",
};

export function EstadoBadge({
  estado,
  className,
}: {
  estado: EstadoDocumento;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", ESTILOS[estado], className)}
    >
      {ETIQUETA_ESTADO[estado]}
    </Badge>
  );
}

/**
 * Aviso ámbar cuando un documento vigente vence en menos de 7 días.
 * Pensado para editores: es su señal de "renovar o dejar caer".
 */
export function AvisoVencePronto({
  vigenteHasta,
  estado,
  className,
}: {
  vigenteHasta: string | null;
  estado: EstadoDocumento;
  className?: string;
}) {
  if (estado !== "vigente" || !vigenteHasta) return null;
  const dias = diasHasta(vigenteHasta);
  if (dias === null || dias > 7 || dias < 0) return null;

  const texto =
    dias === 0 ? "Vence hoy" : dias === 1 ? "Vence mañana" : `Vence en ${dias} días`;

  return (
    <Badge
      variant="outline"
      className={cn(
        "border-amber-300 bg-amber-50 font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
        className,
      )}
    >
      {texto}
    </Badge>
  );
}

/** ¿Está en la ventana de "vence pronto"? Útil para resaltar filas. */
export function vencePronto(vigenteHasta: string | null, estado: EstadoDocumento) {
  if (estado !== "vigente" || !vigenteHasta) return false;
  const dias = diasHasta(vigenteHasta);
  return dias !== null && dias >= 0 && dias <= 7;
}
