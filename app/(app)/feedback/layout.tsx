// Marco común de /feedback: guardia del módulo, encabezado con el nivel de
// quien entra y la navegación del cuadro (la bitácora de eliminados solo se
// enlaza para administradores y quien puede eliminar).
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NavFeedback } from "@/components/feedback/nav-feedback";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { puedeEliminarFeedback } from "@/lib/feedback/datos";
import { exigirModulo } from "@/lib/modulos-acceso";
import { ETIQUETA_NIVEL } from "@/lib/permisos";

/** El guardia va aquí: sin permiso sobre el cuadro, ninguna ruta de /feedback se renderiza (404). */
export default async function LayoutFeedback({ children }: { children: ReactNode }) {
  const { area, nivel, puedeEditar, supabase, perfil } = await exigirModulo("feedback");
  const puedeEliminar = await puedeEliminarFeedback(supabase);
  const verEliminados = perfil.rol === "admin" || puedeEliminar;
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
        descripcion="Feedback operativo por tipo y subtipo, con gravedad, plan de acción, seguimiento y la conformidad del colaborador."
      />
      <NavFeedback puedeEditar={puedeEditar} verEliminados={verEliminados} />
      {children}
    </>
  );
}
