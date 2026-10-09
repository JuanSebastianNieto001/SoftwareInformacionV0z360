/** Nueva auditoría: la cabecera. Al guardar se pasa a marcar la pauta. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormularioAuditoria } from "@/components/calidad/formulario-auditoria";
import { cargarOpcionesFormularioAuditoria } from "@/lib/calidad/datos";
import { exigirModulo } from "@/lib/modulos-acceso";

export const metadata: Metadata = { title: "Nueva auditoría" };

export default async function PaginaNuevaAuditoria() {
  const { supabase, puedeEditar } = await exigirModulo("calidad");
  if (!puedeEditar) notFound();
  const { matrices, asesores } = await cargarOpcionesFormularioAuditoria(supabase);
  return (
    <div className="mx-auto max-w-3xl rounded-[24px] border bg-card p-6 sm:p-8">
      <FormularioAuditoria matrices={matrices ?? []} asesores={asesores ?? []} />
    </div>
  );
}
