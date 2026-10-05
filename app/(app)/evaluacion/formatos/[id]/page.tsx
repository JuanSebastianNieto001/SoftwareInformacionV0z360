import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { HojaEvaluacion } from "@/components/evaluacion/hoja-evaluacion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { registrarAcceso } from "@/lib/auditoria";
import { ETIQUETA_ESTADO_EVALUACION, PESO_DEFECTO, type PerspectivaFormato } from "@/lib/evaluacion";
import { exigirModuloEvaluacion } from "@/lib/evaluacion-acceso";
import { formatearFechaHora } from "@/lib/formato";

export const metadata: Metadata = { title: "Evaluación" };

export default async function PaginaEvaluacion({ params }: PageProps<"/evaluacion/formatos/[id]">) {
  const { id } = await params;
  const { supabase, user, perfil, puedeEditar, puedeEliminar } = await exigirModuloEvaluacion();

  // RLS: sin permiso sobre el módulo la fila no vuelve, y la URL es un 404.
  const { data: evaluacion } = await supabase.from("evaluaciones").select("*").eq("id", id).maybeSingle();
  if (!evaluacion) notFound();

  const [{ data: cargo }, { data: criterios }, { data: calificaciones }, { data: observaciones }, { data: pesosFilas }] =
    await Promise.all([
      supabase.from("evaluacion_cargos").select("*").eq("id", evaluacion.cargo_id).maybeSingle(),
      supabase.from("evaluacion_criterios").select("*").eq("cargo_id", evaluacion.cargo_id).order("orden"),
      supabase
        .from("evaluacion_calificaciones")
        .select("criterio_id, perspectiva, calificacion")
        .eq("evaluacion_id", id),
      supabase.from("evaluacion_observaciones").select("criterio_id, observacion").eq("evaluacion_id", id),
      supabase.from("evaluacion_pesos").select("perspectiva, peso"),
    ]);
  if (!cargo) notFound();

  const pesos: Record<PerspectivaFormato, number> = { ...PESO_DEFECTO };
  for (const p of pesosFilas ?? []) {
    if (p.perspectiva in pesos) pesos[p.perspectiva as PerspectivaFormato] = Number(p.peso);
  }

  // Abrir la hoja de alguien queda en la auditoría, como abrir un documento:
  // es información de personas y hay que poder decir quién la consultó.
  await registrarAcceso(supabase, user, {
    accion: "abrir",
    documento: {
      id: null,
      titulo: `Evaluación · ${evaluacion.evaluado_nombre} · ${evaluacion.periodo}`,
      area_nombre: "Evaluación de desempeño",
    },
    perfilNombre: perfil.nombre,
    request: { headers: await headers() },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link href="/evaluacion/formatos">
            <ArrowLeft /> Formatos por cargo
          </Link>
        </Button>
        <span className="text-xs text-muted-foreground">
          Última modificación {formatearFechaHora(evaluacion.actualizado_en)}
        </span>
      </div>

      {/* Filas 1 y 2 de la hoja */}
      <header className="rounded-[24px] bg-marino px-6 py-5 text-white">
        <p className="text-xs font-semibold tracking-[0.12em] text-white/70 uppercase">
          {cargo.codigo} · {cargo.area_departamento}
        </p>
        <h2 className="mt-1 text-[22px] leading-tight font-semibold sm:text-[26px]">
          Evaluación de desempeño · {cargo.nombre} · Voz 360
        </h2>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/80">
          Gestión de Talento Humano | Formato de evaluación cuantitativa y cualitativa
          <Badge variant={evaluacion.estado === "cerrada" ? "outline" : "secondary"} className="border-white/40 text-white">
            {ETIQUETA_ESTADO_EVALUACION[evaluacion.estado]}
          </Badge>
        </p>
      </header>

      <HojaEvaluacion
        evaluacion={evaluacion}
        cargo={cargo}
        criterios={criterios ?? []}
        calificaciones={calificaciones ?? []}
        observaciones={observaciones ?? []}
        pesos={pesos}
        puedeEditar={puedeEditar}
        puedeEliminar={puedeEliminar}
        esAdmin={perfil.rol === "admin"}
      />
    </div>
  );
}
