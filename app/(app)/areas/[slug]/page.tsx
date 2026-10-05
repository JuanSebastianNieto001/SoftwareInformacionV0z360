/**
 * Un cuadro de documentos: lo que hay en el área, con búsqueda y filtro por
 * estado. Si el cuadro es un módulo, redirige a su pantalla. RLS: sin
 * permiso sobre el área la fila no vuelve y la URL responde 404.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import { EncabezadoPagina, EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { FiltrosDocumentos, limpiarBusqueda } from "@/components/documentos/filtros-documentos";
import { ListaDocumentos } from "@/components/documentos/lista-documentos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MODULOS, esModulo } from "@/lib/modulos";
import { ETIQUETA_NIVEL } from "@/lib/permisos";
import { exigirSesion } from "@/lib/sesion";
import type { EstadoDocumento } from "@/lib/supabase/tipos";
import { ESTADOS } from "@/lib/validaciones";

export async function generateMetadata({ params }: PageProps<"/areas/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Área ${slug}` };
}

export default async function PaginaArea({ params, searchParams }: PageProps<"/areas/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await exigirSesion();

  // RLS: si el usuario no tiene permiso sobre el área, no existe para él.
  const { data: area } = await supabase
    .from("areas")
    .select("id, nombre, slug, descripcion, activa, modulo")
    .eq("slug", slug)
    .maybeSingle();
  if (!area) notFound();
  // Un cuadro-módulo no lista documentos: abre su propia pantalla. El
  // permiso ya quedó comprobado arriba (sin él, la fila no vuelve).
  if (esModulo(area.modulo)) redirect(MODULOS[area.modulo].href);

  const { data: nivel } = await supabase.rpc("nivel_en_area", { a: area.id });
  const puedeEditar = nivel === "edicion";

  const q = limpiarBusqueda(typeof sp.q === "string" ? sp.q : "");
  const estadoParam = typeof sp.estado === "string" ? sp.estado : "";
  const estado = (ESTADOS as readonly string[]).includes(estadoParam)
    ? (estadoParam as EstadoDocumento)
    : "";

  let consulta = supabase
    .from("v_documentos_estado")
    .select(
      "id, titulo, nombre_archivo, tamano_bytes, vigente_desde, vigente_hasta, estado, area_nombre, version, veces_consultado, usuarios_distintos, actualizado_en",
    )
    .eq("area_id", area.id)
    .order("creado_en", { ascending: false })
    .limit(300);

  if (q) consulta = consulta.or(`titulo.ilike.%${q}%,descripcion.ilike.%${q}%`);
  if (estado) consulta = consulta.eq("estado", estado);

  const { data: documentos, error } = await consulta;

  return (
    <>
      <div className="mb-3">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link href="/">
            <ArrowLeft /> Mis áreas
          </Link>
        </Button>
      </div>

      <EncabezadoPagina
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {area.nombre}
            {nivel && (
              <Badge variant={puedeEditar ? "default" : "secondary"}>{ETIQUETA_NIVEL[nivel]}</Badge>
            )}
            {!area.activa && <Badge variant="outline">Área inactiva</Badge>}
          </span>
        }
        descripcion={area.descripcion ?? undefined}
        acciones={
          puedeEditar && (
            <Button asChild>
              <Link href={`/subir?area=${area.id}`}>
                <Upload /> Subir aquí
              </Link>
            </Button>
          )
        }
      />

      <FiltrosDocumentos
        q={q}
        estado={estado}
        mostrarEstado={puedeEditar}
        estadosDisponibles={ESTADOS}
        accion={`/areas/${area.slug}`}
      />

      {error ? (
        <EstadoVacio titulo="No se pudieron cargar los documentos" descripcion={error.message} />
      ) : (
        <ListaDocumentos
          documentos={documentos ?? []}
          resaltarVencimiento={puedeEditar}
          mostrarConsultas={perfil.rol === "admin"}
          vacio={
            q || estado ? (
              <EstadoVacio
                titulo="Sin resultados"
                descripcion="Prueba con otras palabras o quita los filtros."
              />
            ) : (
              <EstadoVacio
                titulo="Esta área todavía no tiene documentos"
                descripcion={
                  puedeEditar
                    ? "Sube el primero con el botón de arriba."
                    : "Cuando el área tenga documentos vigentes aparecerán aquí."
                }
              />
            )
          }
        />
      )}
    </>
  );
}
