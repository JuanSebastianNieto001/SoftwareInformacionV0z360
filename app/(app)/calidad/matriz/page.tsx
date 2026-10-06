/** La pauta de calidad: ítems, pesos, errores críticos y umbral. Solo quien edita el cuadro la ve. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorMatriz } from "@/components/calidad/editor-matriz";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { exigirModulo } from "@/lib/modulos-acceso";

export const metadata: Metadata = { title: "Pauta de calidad" };

export default async function PaginaMatriz() {
  const { supabase, puedeEditar } = await exigirModulo("calidad");
  if (!puedeEditar) notFound();
  const { data: matriz } = await supabase.from("calidad_matrices").select("*").order("activa", { ascending: false }).order("version", { ascending: false }).limit(1).maybeSingle();
  if (!matriz) return <EstadoVacio titulo="No hay ninguna pauta configurada" descripcion="La pauta inicial se carga con la migración del módulo." />;
  const { data: items } = await supabase.from("calidad_items").select("*").eq("matriz_id", matriz.id).order("orden");
  return <EditorMatriz matriz={matriz} items={items ?? []} editable={puedeEditar} />;
}
