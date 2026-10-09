/** La pauta de calidad: ítems, pesos, errores críticos y umbral, más la matriz de penalización. Solo quien edita el cuadro la ve. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorMatriz } from "@/components/calidad/editor-matriz";
import { TablaPenalizacion } from "@/components/calidad/tabla-penalizacion";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { exigirCalidad } from "@/lib/calidad/acceso";
import { cargarPautaVigente } from "@/lib/calidad/datos";

export const metadata: Metadata = { title: "Pauta de calidad" };

export default async function PaginaMatriz() {
  const { supabase, puedeEditar } = await exigirCalidad();
  if (!puedeEditar) notFound();
  const pauta = await cargarPautaVigente(supabase);
  if (!pauta) return <EstadoVacio titulo="No hay ninguna pauta configurada" descripcion="La pauta inicial se carga con la migración del módulo." />;
  const { matriz, items, penalizaciones } = pauta;
  return (
    <div className="space-y-8">
      <EditorMatriz matriz={matriz} items={items ?? []} editable={puedeEditar} />
      <TablaPenalizacion filas={penalizaciones ?? []} />
    </div>
  );
}
