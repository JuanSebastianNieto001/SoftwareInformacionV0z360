"use client";

import { useId, useRef } from "react";
import { FileUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACCEPT_ARCHIVOS, extensionVisible } from "@/lib/archivos";
import { formatearBytes } from "@/lib/formato";
import { cn } from "@/lib/utils";

export function SelectorArchivo({
  archivo,
  onChange,
  deshabilitado = false,
  etiqueta = "Archivo",
}: {
  archivo: File | null;
  onChange: (f: File | null) => void;
  deshabilitado?: boolean;
  etiqueta?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">{etiqueta}</span>
      <input
        ref={ref}
        id={id}
        type="file"
        accept={ACCEPT_ARCHIVOS}
        className="sr-only"
        disabled={deshabilitado}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {archivo ? (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background text-xs font-semibold">
            {extensionVisible(archivo.name) || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{archivo.name}</p>
            <p className="text-xs text-muted-foreground">{formatearBytes(archivo.size)}</p>
          </div>
          {!deshabilitado && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Quitar archivo"
              onClick={() => {
                onChange(null);
                if (ref.current) ref.current.value = "";
              }}
            >
              <X />
            </Button>
          )}
        </div>
      ) : (
        <label
          htmlFor={id}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-8 text-center transition-colors hover:bg-muted/50",
            deshabilitado && "pointer-events-none opacity-50",
          )}
        >
          <FileUp className="size-6 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">Toca para elegir un archivo</span>
          <span className="text-xs text-muted-foreground">PDF, JPG, PNG, Word, Excel o PowerPoint · máx. 50 MB</span>
        </label>
      )}
    </div>
  );
}

export function BarraProgreso({ fraccion, etiqueta }: { fraccion: number; etiqueta?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(fraccion * 100)));
  return (
    <div className="space-y-1" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      {etiqueta && (
        <p className="text-xs text-muted-foreground">
          {etiqueta} · {pct}%
        </p>
      )}
    </div>
  );
}
