// Barra de avance hacia la meta y distintivo de estado de un indicador o PDA.
import { CheckCircle2, CircleDashed, Clock, XCircle } from "lucide-react";
import { porcentaje } from "@/lib/pda";
import { cn } from "@/lib/utils";

export type EstadoMeta = "cumple" | "en_curso" | "no_cumple" | "sin_medir";

/**
 * Veredicto que se muestra. Un indicador medido que aún no llega a la meta
 * está "en curso" mientras el PDA sigue abierto; al cerrarse, "no cumplió".
 */
export function estadoMeta(cumple: boolean | null, cerrado: boolean): EstadoMeta {
  if (cumple === null) return "sin_medir";
  if (cumple) return "cumple";
  return cerrado ? "no_cumple" : "en_curso";
}

const ESTILO: Record<EstadoMeta, { etiqueta: string; icono: typeof CheckCircle2; texto: string; relleno: string }> = {
  cumple: { etiqueta: "Cumple", icono: CheckCircle2, texto: "text-emerald-700", relleno: "bg-emerald-600" },
  en_curso: { etiqueta: "En curso", icono: Clock, texto: "text-amber-700", relleno: "bg-amber-500" },
  no_cumple: { etiqueta: "No cumplió", icono: XCircle, texto: "text-red-700", relleno: "bg-red-600" },
  sin_medir: { etiqueta: "Sin medir", icono: CircleDashed, texto: "text-muted-foreground", relleno: "bg-muted-foreground/40" },
};

/** Estado con icono y texto: el color nunca va solo. */
export function DistintivoMeta({ estado, etiqueta, className }: { estado: EstadoMeta; etiqueta?: string; className?: string }) {
  const e = ESTILO[estado];
  const Icono = e.icono;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap", e.texto, className)}>
      <Icono className="size-3.5" aria-hidden />
      {etiqueta ?? e.etiqueta}
    </span>
  );
}

/**
 * Avance hacia la meta, donde el 100 % es la meta. Si se supera, la barra
 * se llena y el porcentaje real se lee en el texto.
 */
export function BarraAvance({
  avance,
  estado,
  detalle,
  className,
}: {
  avance: number | null;
  estado: EstadoMeta;
  /** Texto del tooltip con los valores exactos. */
  detalle?: string;
  className?: string;
}) {
  const ancho = avance === null ? 0 : Math.max(0, Math.min(100, Number(avance)));
  return (
    <div className={cn("flex items-center gap-2", className)} title={detalle}>
      <div
        className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={avance ?? 0}
        aria-label={detalle ?? "Avance hacia la meta"}
      >
        <div className={cn("h-full rounded-full transition-[width]", ESTILO[estado].relleno)} style={{ width: `${ancho}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right text-xs font-medium tabular-nums">{porcentaje(avance)}</span>
    </div>
  );
}
