import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EstadoDocumento } from "@/lib/supabase/tipos";
import { diasHasta } from "@/lib/formato";

// Tintes planos del handoff, sin borde: el color de fondo ya separa la
// pastilla del blanco de la tarjeta.
const ESTILOS: Record<EstadoDocumento, string> = {
  vigente: "border-transparent bg-[#dcfce7] text-[#166534]",
  programado: "border-transparent bg-tinte text-marino-suave",
  vencido: "border-transparent bg-[#fee2e2] text-[#991b1b]",
  purgado: "border-transparent bg-background text-nav-inactivo",
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
        "border-transparent bg-[#fef3c7] font-medium text-[#92400e]",
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
