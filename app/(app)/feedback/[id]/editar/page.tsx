// Editar un feedback. Solo quien edita el cuadro; mismo alcance que al crear.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormularioFeedback } from "@/components/feedback/formulario-feedback";
import { cargarOpcionesFormulario, obtenerFeedbackParaEditar } from "@/lib/feedback/datos";
import { exigirModulo } from "@/lib/modulos-acceso";

export const metadata: Metadata = { title: "Editar feedback" };

export default async function PaginaEditarFeedback({ params }: PageProps<"/feedback/[id]/editar">) {
  const { id } = await params;
  const { supabase, user, perfil, puedeEditar } = await exigirModulo("feedback");
  if (!puedeEditar) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const feedback = await obtenerFeedbackParaEditar(supabase, id);
  if (!feedback) notFound();

  const { opciones, catalogo } = await cargarOpcionesFormulario(supabase, { userId: user.id, esAdmin: perfil.rol === "admin" });

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">Editar feedback</h2>
      <FormularioFeedback catalogo={catalogo} colaboradores={opciones} feedback={feedback} />
    </div>
  );
}
