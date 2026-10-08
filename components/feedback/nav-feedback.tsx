"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListChecks, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const PESTANAS = [
  { href: "/feedback", etiqueta: "Panel", icono: LayoutDashboard, exacto: true },
  { href: "/feedback/nuevo", etiqueta: "Nuevo feedback", icono: Plus, soloEditar: true },
  { href: "/feedback/catalogo", etiqueta: "Catálogo", icono: ListChecks },
] as const;

/** Pestañas del módulo de retroalimentación. Registrar solo lo ven quienes editan. */
export function NavFeedback({ puedeEditar }: { puedeEditar: boolean }) {
  const pathname = usePathname();
  const visibles = PESTANAS.filter((p) => puedeEditar || !("soloEditar" in p && p.soloEditar));
  return (
    <nav aria-label="Feedback" className="mb-6 flex flex-wrap gap-1 rounded-full border bg-card p-1">
      {visibles.map((p) => {
        const activo = "exacto" in p && p.exacto ? pathname === p.href : pathname.startsWith(p.href);
        const Icono = p.icono;
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={activo ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13.5px] font-medium transition-colors",
              activo ? "bg-primary text-primary-foreground shadow-boton" : "text-nav-inactivo hover:bg-tinte hover:text-primary",
            )}
          >
            <Icono className="size-4" aria-hidden />
            {p.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}

/** Select nativo con el mismo aspecto que los inputs de la aplicación. */
export const SELECT_FEEDBACK =
  "h-[40px] w-full rounded-lg border-[1.5px] border-input bg-campo px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-ring/20";
