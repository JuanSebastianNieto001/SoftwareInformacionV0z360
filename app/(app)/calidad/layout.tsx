/**
 * Marco común de /calidad: encabezado del cuadro con el nivel de quien
 * entra y la navegación del módulo (la bitácora de eliminadas solo aparece
 * para administradores y quien puede eliminar).
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NavCalidad } from "@/components/calidad/nav-calidad";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { puedeEliminarAuditorias } from "@/lib/calidad/datos";
import { exigirModulo } from "@/lib/modulos-acceso";
import { ETIQUETA_NIVEL } from "@/lib/permisos";

/** El guardia va aquí: sin permiso sobre el cuadro, ninguna ruta de /calidad se renderiza. */
export default async function LayoutCalidad({ children }: { children: ReactNode }) {
  const { area, nivel, puedeEditar, supabase, perfil } = await exigirModulo("calidad");
  const puedeEliminar = await puedeEliminarAuditorias(supabase);
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
