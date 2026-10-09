/**
 * Panel · Documentos: todos los documentos de todas las áreas con su estado
 * de vigencia.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Files, Upload } from "lucide-react";
import { EncabezadoPagina, EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { ETIQUETA_ESTADO } from "@/components/documentos/estado-badge";
import { FiltrosDocumentos, limpiarBusqueda } from "@/components/documentos/filtros-documentos";
import { ListaDocumentos } from "@/components/documentos/lista-documentos";
import { Button } from "@/components/ui/button";
import { listarAreasParaFiltro } from "@/lib/admin/datos";
import { contarDocumentosPorEstado, listarDocumentos } from "@/lib/documentos/datos";
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

  const [{ documentos, error }, areas, conteos] = await Promise.all([
    listarDocumentos(supabase, { q, estado, areaId: area, limite: 500 }),
    listarAreasParaFiltro(supabase),
    // Uno por estado, en el orden de ESTADOS: conteos[i] es el de ESTADOS[i].
    contarDocumentosPorEstado(supabase),
  ]);

  return (
    <>
      <EncabezadoPagina
        kicker="Administración"
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
