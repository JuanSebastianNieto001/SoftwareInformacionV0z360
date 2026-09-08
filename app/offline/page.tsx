import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "Sin conexión" };

/** Página que sirve el service worker cuando no hay red. */
export default function SinConexion() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 text-center">
      <WifiOff className="mb-3 size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">Sin conexión</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Los documentos se consultan en línea para garantizar que veas siempre la versión vigente. Cuando
        recuperes señal, vuelve a intentarlo.
      </p>
      {/* Enlace nativo a propósito: al estar sin red queremos una recarga completa, no navegación cliente. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="mt-5 inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Reintentar
      </a>
    </main>
  );
}
