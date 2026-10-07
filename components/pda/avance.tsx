// Barra de avance y distintivo de estado de un objetivo o de un PDA.
import { CheckCircle2, CircleDashed, Clock, MinusCircle, XCircle } from "lucide-react";
import { ETIQUETA_ESTADO_OBJETIVO, porcentaje, type EstadoObjetivo } from "@/lib/pda";
import { cn } from "@/lib/utils";

export type EstadoVisual = EstadoObjetivo | "sin_datos";

const ESTILO: Record<EstadoVisual, { etiqueta: string; icono: typeof CheckCircle2; texto: string; relleno: string }> = {
  cumplido: { etiqueta: ETIQUETA_ESTADO_OBJETIVO.cumplido, icono: CheckCircle2, texto: "text-emerald-700", relleno: "bg-emerald-600" },
  parcial: { etiqueta: ETIQUETA_ESTADO_OBJETIVO.parcial, icono: MinusCircle, texto: "text-amber-700", relleno: "bg-amber-500" },
  no_cumplido: { etiqueta: ETIQUETA_ESTADO_OBJETIVO.no_cumplido, icono: XCircle, texto: "text-red-700", relleno: "bg-red-600" },
  en_curso: { etiqueta: ETIQUETA_ESTADO_OBJETIVO.en_curso, icono: Clock, texto: "text-primary", relleno: "bg-primary" },
  sin_datos: { etiqueta: "Sin datos", icono: CircleDashed, texto: "text-muted-foreground", relleno: "bg-muted-foreground/40" },
};

/** Estado con icono y texto: el color nunca va solo. */
export function DistintivoEstado({ estado, etiqueta, className }: { estado: EstadoVisual; etiqueta?: string; className?: string }) {
  const e = ESTILO[estado];
  const Icono = e.icono;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap", e.texto, className)}>
      <Icono className="size-3.5" aria-hidden />
      {etiqueta ?? e.etiqueta}
    </span>
  );
}

/** Barra de 0 a 100 con el porcentaje al lado. */
export function BarraAvance({
  avance,
  estado,
  detalle,
  className,
}: {
  avance: number | null;
  estado: EstadoVisual;
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
        aria-label={detalle ?? "Avance"}
      >
        <div className={cn("h-full rounded-full transition-[width]", ESTILO[estado].relleno)} style={{ width: `${ancho}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right text-xs font-medium tabular-nums">{porcentaje(avance)}</span>
    </div>
  );
}
