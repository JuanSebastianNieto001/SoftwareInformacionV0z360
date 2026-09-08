import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
  className,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {acciones && <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}

export function EstadoVacio({
  icono,
  titulo,
  descripcion,
  accion,
  className,
}: {
  icono?: ReactNode;
  titulo: string;
  descripcion?: ReactNode;
  accion?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      {icono && <div className="mb-3 text-muted-foreground [&_svg]:size-8">{icono}</div>}
      <p className="text-sm font-medium">{titulo}</p>
      {descripcion && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{descripcion}</p>
      )}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}
