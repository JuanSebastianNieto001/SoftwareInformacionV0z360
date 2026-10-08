import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NavCalidad } from "@/components/calidad/nav-calidad";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exigirModulo } from "@/lib/modulos-acceso";
import { ETIQUETA_NIVEL } from "@/lib/permisos";

/** El guardia va aquí: sin permiso sobre el cuadro, ninguna ruta de /calidad se renderiza. */
export default async function LayoutCalidad({ children }: { children: ReactNode }) {
  const { area, nivel, puedeEditar, supabase, perfil } = await exigirModulo("calidad");
  const { data: puedeEliminar } = await supabase.rpc("calidad_puede_eliminar");
  const verEliminadas = perfil.rol === "admin" || puedeEliminar === true;
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
        kicker="QualityCore"
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {area.nombre}
            <Badge variant={puedeEditar ? "default" : "secondary"}>{ETIQUETA_NIVEL[nivel]}</Badge>
          </span>
        }
        descripcion="Auditorías con la pauta de calidad, retroalimentación firmada por el asesor y seguimiento de compromisos."
      />
      <NavCalidad puedeEditar={puedeEditar} verEliminadas={verEliminadas} />
      {children}
    </>
  );
}
