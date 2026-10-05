"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutDashboard, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const PESTANAS = [
  { href: "/evaluacion", etiqueta: "Dashboard", icono: LayoutDashboard, exacto: true },
  { href: "/evaluacion/formatos", etiqueta: "Formatos por cargo", icono: ClipboardList },
  { href: "/evaluacion/360", etiqueta: "Matriz 360", icono: Users },
] as const;

/**
 * Las tres pestañas del módulo, que corresponden a las tres clases de hoja
 * del libro: el Dashboard/Resumen, las hojas por cargo y la matriz
 * "Evaluaciones".
 */
export function NavEvaluacion() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Evaluación de desempeño"
      className="mb-6 flex flex-wrap gap-1 rounded-full border bg-card p-1"
    >
      {PESTANAS.map((p) => {
        const activo = "exacto" in p && p.exacto ? pathname === p.href : pathname.startsWith(p.href);
        const Icono = p.icono;
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={activo ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13.5px] font-medium transition-colors",
              activo
                ? "bg-primary text-primary-foreground shadow-boton"
                : "text-nav-inactivo hover:bg-tinte hover:text-primary",
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
