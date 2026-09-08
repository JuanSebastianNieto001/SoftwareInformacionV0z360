import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { FormularioEdicion } from "@/components/formulario-edicion";
import { Button } from "@/components/ui/button";
import { isoADia } from "@/lib/formato";
import { exigirSesion } from "@/lib/sesion";

export const metadata: Metadata = { title: "Editar documento" };

export default async function PaginaEditarDocumento({ params }: PageProps<"/documentos/[id]/editar">) {
  const { id } = await params;
  const { supabase } = await exigirSesion();

  const { data: doc } = await supabase
    .from("documentos")
    .select(
      "id, area_id, titulo, descripcion, etiquetas, nombre_archivo, mime, tamano_bytes, version, vigente_desde, vigente_hasta, purgado_en, areas(nombre)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!doc) notFound();

  // Guardia de UI: sin nivel de edición se vuelve al detalle. RLS haría
  // fallar cualquier PATCH de todos modos.
  const { data: nivel } = await supabase.rpc("nivel_en_area", { a: doc.area_id });
  if (nivel !== "edicion") redirect(`/documentos/${doc.id}`);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link href={`/documentos/${doc.id}`}>
            <ArrowLeft /> Volver al documento
          </Link>
        </Button>
      </div>

      <EncabezadoPagina
        titulo="Editar documento"
        descripcion={`${doc.areas?.nombre ?? ""} · versión ${doc.version}`}
      />

      <FormularioEdicion
        documento={{
          id: doc.id,
          area_id: doc.area_id,
          titulo: doc.titulo,
          descripcion: doc.descripcion ?? "",
          etiquetas: doc.etiquetas.join(", "),
          nombre_archivo: doc.nombre_archivo,
          tamano_bytes: doc.tamano_bytes,
          version: doc.version,
          desde: isoADia(doc.vigente_desde),
          hasta: isoADia(doc.vigente_hasta),
          purgado: doc.purgado_en !== null,
        }}
      />
    </div>
  );
}
