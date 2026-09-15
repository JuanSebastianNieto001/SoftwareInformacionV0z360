import Link from "next/link";
import { ChevronRight, FolderOpen, MessageSquareText, Upload } from "lucide-react";
import { EncabezadoPagina, EstadoVacio } from "@/components/encabezado-pagina";
import { ListaDocumentos } from "@/components/lista-documentos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isoDentroDe, plural } from "@/lib/formato";
import { ETIQUETA_NIVEL, nivelEfectivo, puedeSubir } from "@/lib/permisos";
import { exigirSesion } from "@/lib/sesion";

export default async function PaginaInicio() {
  const { supabase, perfil } = await exigirSesion();
  const editor = puedeSubir(perfil);

  const [{ data: areas }, { data: permisos }, porVencer] = await Promise.all([
    // RLS: solo devuelve las áreas donde nivel_en_area() no es null.
    supabase
      .from("areas")
      .select("id, nombre, slug, descripcion, documentos(count)")
      .eq("activa", true)
      .order("nombre"),
    supabase.from("permisos_area").select("area_id, nivel").eq("usuario_id", perfil.id),
    editor
      ? supabase
          .from("v_documentos_estado")
          .select(
            "id, titulo, nombre_archivo, tamano_bytes, vigente_desde, vigente_hasta, estado, area_nombre, version, veces_consultado, usuarios_distintos, actualizado_en",
          )
          .eq("estado", "vigente")
          .not("vigente_hasta", "is", null)
          .lte("vigente_hasta", isoDentroDe(7))
          .order("vigente_hasta", { ascending: true })
          .limit(20)
      : Promise.resolve({ data: null }),
  ]);

  const nivelPorArea = new Map((permisos ?? []).map((p) => [p.area_id, p.nivel]));

  return (
    <>
      <EncabezadoPagina
        titulo={`Hola, ${perfil.nombre.split(" ")[0] || "bienvenido"}`}
        descripcion="Estas son las áreas a las que tienes acceso."
        acciones={
          editor && (
            <Button asChild>
              <Link href="/subir">
                <Upload /> Subir documento
              </Link>
            </Button>
          )
        }
      />

      {(!areas || areas.length === 0) && (
        <EstadoVacio
          className="mb-3"
          icono={<FolderOpen />}
          titulo="Aún no tienes áreas asignadas"
          descripcion={
            perfil.rol === "admin"
              ? "Crea la primera área desde Administración → Áreas."
              : "Pide al administrador que te asigne permisos sobre las áreas que necesitas."
          }
          accion={
            perfil.rol === "admin" && (
              <Button asChild variant="outline">
                <Link href="/admin/areas">Ir a Áreas</Link>
              </Button>
            )
          }
        />
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(areas ?? []).map((area) => {
          const nivel = nivelEfectivo(perfil.rol, perfil.activo, nivelPorArea.get(area.id));
          const cantidad = area.documentos?.[0]?.count ?? 0;
          return (
            <li key={area.id}>
              <Link
                href={`/areas/${area.slug}`}
                className="group flex h-full flex-col rounded-lg border bg-card p-4 transition-colors hover:border-foreground/30 active:bg-muted"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-medium leading-snug">{area.nombre}</h2>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                {area.descripcion && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{area.descripcion}</p>
                )}
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{plural(cantidad, "documento", "documentos")}</span>
                  {nivel && (
                    <Badge variant={nivel === "edicion" ? "default" : "secondary"}>
                      {ETIQUETA_NIVEL[nivel]}
                    </Badge>
                  )}
                </div>
              </Link>
            </li>
          );
        })}

        {/*
          El buzón no es un área: no tiene documentos ni permisos. Comparte la
          rejilla porque para quien entra es una puerta más, pero se distingue
          con el borde punteado y sin contador de documentos.
        */}
        <li>
          <Link
            href="/buzon"
            className="group flex h-full flex-col rounded-lg border border-dashed bg-card p-4 transition-colors hover:border-foreground/30 active:bg-muted"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="flex items-center gap-2 font-medium leading-snug">
                <MessageSquareText className="size-4 shrink-0 text-muted-foreground" />
                Buzón de sugerencias
              </h2>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Envía una sugerencia, queja, felicitación o no conformidad.
            </p>
            <span className="mt-3 text-xs text-muted-foreground">
              Queda con número de radicado
            </span>
          </Link>
        </li>
      </ul>

      {editor && porVencer.data && porVencer.data.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-base font-semibold">Vencen en los próximos 7 días</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Renueva la vigencia o sube una versión nueva antes de que desaparezcan de la vista de los lectores.
          </p>
          <ListaDocumentos documentos={porVencer.data} mostrarArea resaltarVencimiento />
        </section>
      )}
    </>
  );
}
