import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exigirModulo } from "@/lib/modulos-acceso";
import { ETIQUETA_NIVEL } from "@/lib/permisos";

/** El guardia va aquí: sin permiso sobre el cuadro, ninguna ruta de /pda se renderiza (404). */
export default async function LayoutPda({ children }: { children: ReactNode }) {
  const { area, nivel, puedeEditar } = await exigirModulo("pda");

  return (
    <>
      <div className="mb-3">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link href="/">
            <ArrowLeft /> Mis áreas
          </Link>
        </Button>
      </div>

      <EncabezadoPagina
        kicker="Tecnología de la Información"
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {area.nombre}
            <Badge variant={puedeEditar ? "default" : "secondary"}>{ETIQUETA_NIVEL[nivel]}</Badge>
          </span>
        }
        descripcion="El plan de TI de cada mes: sus indicadores, las mediciones y si se alcanzó la meta."
      />
      {children}
    </>
  );
}
