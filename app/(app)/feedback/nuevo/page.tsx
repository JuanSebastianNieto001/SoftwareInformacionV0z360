// Registrar un feedback nuevo. Solo quien edita el cuadro; el buscador de
// colaborador se acota al alcance del emisor y el catálogo de liderazgo solo
// se le ofrece a quien emite a todos (la base lo exige igual).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormularioFeedback } from "@/components/feedback/formulario-feedback";
import { cargarColaboradores } from "@/lib/feedback-colaboradores";
import { exigirModulo } from "@/lib/modulos-acceso";

export const metadata: Metadata = { title: "Nuevo feedback" };

export default async function PaginaNuevoFeedback() {
  const { supabase, user, perfil, puedeEditar } = await exigirModulo("feedback");
  if (!puedeEditar) notFound();

  const { opciones, emiteTodos } = await cargarColaboradores(supabase, { userId: user.id, esAdmin: perfil.rol === "admin" });
  let consulta = supabase.from("feedback_catalogo").select("*").eq("activo", true).order("orden");
  if (!emiteTodos) consulta = consulta.eq("solo_direccion", false);
  const { data: catalogo } = await consulta;

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">Nuevo feedback</h2>
      <FormularioFeedback catalogo={catalogo ?? []} colaboradores={opciones} />
    </div>
  );
}
