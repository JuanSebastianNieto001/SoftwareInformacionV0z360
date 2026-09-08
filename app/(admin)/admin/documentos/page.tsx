import type { Metadata } from "next";
import Link from "next/link";
import { Files, Upload } from "lucide-react";
import { EncabezadoPagina, EstadoVacio } from "@/components/encabezado-pagina";
import { ETIQUETA_ESTADO } from "@/components/estado-badge";
import { FiltrosDocumentos, limpiarBusqueda } from "@/components/filtros-documentos";
import { ListaDocumentos } from "@/components/lista-documentos";
import { Button } from "@/components/ui/button";
import { exigirAdmin } from "@/lib/sesion";
import type { EstadoDocumento } from "@/lib/supabase/tipos";
import { ESTADOS } from "@/lib/validaciones";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Todos los documentos" };

export default async function PaginaDocumentosAdmin({ searchParams }: PageProps<"/admin/documentos">) {
  const sp = await searchParams;
  const { supabase } = await exigirAdmin();

  const q = limpiarBusqueda(typeof sp.q === "string" ? sp.q : "");
  const estadoParam = typeof sp.estado === "string" ? sp.estado : "";
  const estado = (ESTADOS as readonly string[]).includes(estadoParam) ? (estadoParam as EstadoDocumento) : "";
  const area = typeof sp.area === "string" && /^[0-9a-f-]{36}$/i.test(sp.area) ? sp.area : "";

  let consulta = supabase
    .from("v_documentos_estado")
    .select(
      "id, titulo, nombre_archivo, tamano_bytes, vigente_desde, vigente_hasta, estado, area_nombre, version, veces_consultado, usuarios_distintos, actualizado_en",
    )
    .order("creado_en", { ascending: false })
    .limit(500);
  if (q) consulta = consulta.or(`titulo.ilike.%${q}%,descripcion.ilike.%${q}%`);
  if (estado) consulta = consulta.eq("estado", estado);
  if (area) consulta = consulta.eq("area_id", area);

  const [{ data: documentos, error }, { data: areas }, ...conteos] = await Promise.all([
    consulta,
    supabase.from("areas").select("id, nombre").order("nombre"),
    ...ESTADOS.map((e) =>
      supabase.from("v_documentos_estado").select("id", { count: "exact", head: true }).eq("estado", e),
    ),
  ]);

  return (
    <>
      <EncabezadoPagina
        titulo="Todos los documentos"
        descripcion="Incluye vencidos, programados y purgados. Los lectores solo ven los vigentes."
        acciones={
          <Button asChild>
            <Link href="/subir">
              <Upload /> Subir documento
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {ESTADOS.map((e, i) => {
          const activo = estado === e;
          const qs = new URLSearchParams();
          if (q) qs.set("q", q);
          if (area) qs.set("area", area);
          if (!activo) qs.set("estado", e);
          return (
            <Link
              key={e}
              href={`/admin/documentos?${qs.toString()}`}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm",
                activo ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
              )}
            >
              {ETIQUETA_ESTADO[e]}{" "}
              <span className={cn("tabular-nums", activo ? "opacity-80" : "text-muted-foreground")}>
                {conteos[i]?.count ?? 0}
              </span>
            </Link>
          );
        })}
      </div>

      <FiltrosDocumentos q={q} estado={estado} area={area} areas={areas ?? []} accion="/admin/documentos" />

      {error ? (
        <EstadoVacio titulo="No se pudieron cargar los documentos" descripcion={error.message} />
      ) : (
        <ListaDocumentos
          documentos={documentos ?? []}
          mostrarArea
          resaltarVencimiento
          mostrarConsultas
          vacio={
            <EstadoVacio
              icono={<Files />}
              titulo={q || estado || area ? "Sin resultados" : "Aún no hay documentos"}
              descripcion={q || estado || area ? "Prueba con otros filtros." : "Sube el primero desde el botón de arriba."}
            />
          }
        />
      )}
    </>
  );
}
