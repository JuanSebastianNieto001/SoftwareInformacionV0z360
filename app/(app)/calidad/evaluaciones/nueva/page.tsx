/**
 * Nueva auditoría: la cabecera. Al guardar se pasa a marcar la pauta. La
 * crea quien audita en Calidad o un team leader; a este el selector le llega
 * filtrado por RLS a los asesores de su equipo.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormularioAuditoria } from "@/components/calidad/formulario-auditoria";
import { exigirCalidad } from "@/lib/calidad/acceso";
import { cargarOpcionesFormularioAuditoria } from "@/lib/calidad/datos";

export const metadata: Metadata = { title: "Nueva auditoría" };

export default async function PaginaNuevaAuditoria() {
  const { supabase, puedeAuditar, alcance } = await exigirCalidad();
  if (!puedeAuditar) notFound();
  const { matrices, asesores } = await cargarOpcionesFormularioAuditoria(supabase);
  return (
    <div className="mx-auto max-w-3xl rounded-[24px] border bg-card p-6 sm:p-8">
      {alcance === "equipo" && <p className="mb-4 text-xs text-muted-foreground">Solo aparecen los asesores de tu equipo.</p>}
      <FormularioAuditoria matrices={matrices ?? []} asesores={asesores ?? []} />
    </div>
  );
}
