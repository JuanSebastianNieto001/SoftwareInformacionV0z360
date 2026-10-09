// Alta de una evaluación por cargo (solo con nivel de edición): la cabecera de
// la hoja; al guardar se abre la hoja para calificar.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormularioEvaluacionNueva } from "@/components/evaluacion/formulario-evaluacion-nueva";
import { listarCargosParaNuevaEvaluacion } from "@/lib/evaluacion/datos";
import { exigirModulo } from "@/lib/modulos-acceso";

export const metadata: Metadata = { title: "Nueva evaluación" };

export default async function PaginaNuevaEvaluacion() {
  const { supabase, perfil, puedeEditar } = await exigirModulo("evaluacion");
  // Con solo Vista, la pantalla de alta no existe: RLS rechazaría el insert
  // igualmente, pero no hay por qué mostrar un formulario que no va a funcionar.
  if (!puedeEditar) notFound();

  const cargos = await listarCargosParaNuevaEvaluacion(supabase);

  return (
    <div className="mx-auto max-w-3xl">
      <FormularioEvaluacionNueva
        cargos={cargos ?? []}
        evaluadorPorDefecto={{ nombre: perfil.nombre, cargo: perfil.cargo }}
      />
    </div>
  );
}
