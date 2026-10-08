// Registrar un feedback nuevo. Solo quien edita el cuadro; el catálogo de
// liderazgo solo se le ofrece a administradores (y la base lo exige igual).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormularioFeedback } from "@/components/feedback/formulario-feedback";
import { cargarColaboradores } from "@/lib/feedback-colaboradores";
import { exigirModulo } from "@/lib/modulos-acceso";

export const metadata: Metadata = { title: "Nuevo feedback" };

export default async function PaginaNuevoFeedback() {
  const { supabase, puedeEditar, perfil } = await exigirModulo("feedback");
  if (!puedeEditar) notFound();
  const esAdmin = perfil.rol === "admin";

  let consulta = supabase.from("feedback_catalogo").select("*").eq("activo", true).order("orden");
  if (!esAdmin) consulta = consulta.eq("solo_direccion", false);
  const [{ data: catalogo }, colaboradores] = await Promise.all([consulta, cargarColaboradores(supabase)]);

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">Nuevo feedback</h2>
      <FormularioFeedback catalogo={catalogo ?? []} colaboradores={colaboradores} />
    </div>
  );
}
