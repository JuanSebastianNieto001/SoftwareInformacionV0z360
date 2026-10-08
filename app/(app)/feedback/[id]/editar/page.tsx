// Editar un feedback. Solo quien edita el cuadro.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormularioFeedback } from "@/components/feedback/formulario-feedback";
import { cargarColaboradores } from "@/lib/feedback-colaboradores";
import { exigirModulo } from "@/lib/modulos-acceso";

export const metadata: Metadata = { title: "Editar feedback" };

export default async function PaginaEditarFeedback({ params }: PageProps<"/feedback/[id]/editar">) {
  const { id } = await params;
  const { supabase, puedeEditar, perfil } = await exigirModulo("feedback");
  if (!puedeEditar) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data: feedback } = await supabase.from("feedback").select("*").eq("id", id).maybeSingle();
  if (!feedback) notFound();

  const esAdmin = perfil.rol === "admin";
  let consulta = supabase.from("feedback_catalogo").select("*").eq("activo", true).order("orden");
  if (!esAdmin) consulta = consulta.eq("solo_direccion", false);
  const [{ data: catalogo }, colaboradores] = await Promise.all([consulta, cargarColaboradores(supabase)]);

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">Editar feedback</h2>
      <FormularioFeedback catalogo={catalogo ?? []} colaboradores={colaboradores} feedback={feedback} />
    </div>
  );
}
