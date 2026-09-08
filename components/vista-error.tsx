"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VistaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
      <AlertTriangle className="mb-3 size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">Algo salió mal al cargar esta página</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Puede ser un problema de conexión. Inténtalo de nuevo; si persiste, avisa al administrador.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">ref: {error.digest}</p>}
      <div className="mt-4 flex gap-2">
        <Button onClick={reset}>Reintentar</Button>
        <Button variant="outline" asChild>
          <Link href="/">Ir al inicio</Link>
        </Button>
      </div>
    </div>
  );
}
