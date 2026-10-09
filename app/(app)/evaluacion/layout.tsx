// Marco del módulo de Evaluación de desempeño: guardia, encabezado y pestañas.
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { NavEvaluacion } from "@/components/evaluacion/nav-evaluacion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exigirModulo } from "@/lib/modulos-acceso";
import { ETIQUETA_NIVEL } from "@/lib/permisos";

/**
 * Marco común de /evaluacion. El guardia va aquí y no en cada página: si
 * la persona no tiene permiso sobre el cuadro, ninguna ruta del módulo
 * llega a renderizarse, escriba la URL que escriba.
 */
export default async function LayoutEvaluacion({ children }: { children: ReactNode }) {
  const { area, nivel, puedeEditar } = await exigirModulo("evaluacion");

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
        kicker="Gestión de Talento Humano"
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {area.nombre}
            <Badge variant={puedeEditar ? "default" : "secondary"}>{ETIQUETA_NIVEL[nivel]}</Badge>
          </span>
        }
        descripcion="Formato de evaluación cuantitativa y cualitativa 360°. Las notas se calculan igual que en la hoja de cálculo."
      />

      <NavEvaluacion />
      {children}
    </>
  );
}
