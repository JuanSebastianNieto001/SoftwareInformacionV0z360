"use client";

// Barra de pestañas de /calidad, la pinta app/(app)/calidad/layout.tsx. Es de
// cliente solo para marcar la pestaña activa con usePathname. Ocultar una
// pestaña no protege la ruta: cada página vuelve a comprobar y responde 404.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutDashboard, ListChecks, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const PESTANAS = [
  { href: "/calidad", etiqueta: "Dashboard", icono: LayoutDashboard, exacto: true },
  { href: "/calidad/evaluaciones", etiqueta: "Auditorías", icono: ClipboardList },
  { href: "/calidad/matriz", etiqueta: "Pauta", icono: ListChecks },
  { href: "/calidad/asesores", etiqueta: "Estructura", icono: Users },
  { href: "/calidad/eliminadas", etiqueta: "Eliminadas", icono: Trash2 },
] as const;

/**
 * Las pestañas del módulo de calidad. La configuración (pauta y
 * estructura) solo la ven quienes editan; la bitácora de eliminadas, los
 * administradores y quien puede eliminar.
 */
export function NavCalidad({ puedeEditar, verEliminadas = false }: { puedeEditar: boolean; verEliminadas?: boolean }) {
  const pathname = usePathname();
  const visibles = PESTANAS.filter((p) => {
    if (p.href === "/calidad/eliminadas") return verEliminadas;
    return puedeEditar || (p.href !== "/calidad/matriz" && p.href !== "/calidad/asesores");
  });
  return (
    <nav aria-label="Calidad" className="mb-6 flex flex-wrap gap-1 rounded-full border bg-card p-1">
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
