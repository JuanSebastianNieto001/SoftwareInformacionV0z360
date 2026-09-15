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
        kicker="Mis áreas"
        titulo={`Hola, ${perfil.nombre.split(" ")[0] || "bienvenido"}`}
        descripcion="Estas son las áreas a las que tienes acceso."
        acciones={
          editor && (
            <Button asChild size="lg">
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

      <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
        {(areas ?? []).map((area) => {
          const nivel = nivelEfectivo(perfil.rol, perfil.activo, nivelPorArea.get(area.id));
          const cantidad = area.documentos?.[0]?.count ?? 0;
          return (
            <li key={area.id}>
              <Link
                href={`/areas/${area.slug}`}
                className="group flex h-full min-h-[150px] flex-col gap-3 rounded-[20px] border bg-card p-[22px] transition-all duration-150 hover:-translate-y-0.5 hover:border-borde-acento hover:shadow-tarjeta"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-tinte text-primary">
                    <FolderOpen className="size-5" aria-hidden />
                  </span>
                  {nivel && (
                    <Badge variant={nivel === "edicion" ? "default" : "secondary"}>
                      {ETIQUETA_NIVEL[nivel]}
                    </Badge>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base leading-snug font-semibold">{area.nombre}</h2>
                  {area.descripcion && (
                    <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">
                      {area.descripcion}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
                  <span>{plural(cantidad, "documento", "documentos")}</span>
                  <ChevronRight className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            </li>
          );
        })}

        {/*
          El buzón no es un área: no tiene documentos ni permisos. Comparte la
          rejilla porque para quien entra es una puerta más, pero el degradado
          lo separa de las carpetas sin necesidad de explicarlo.
        */}
        <li>
          <Link
            href="/buzon"
            className="group flex h-full min-h-[150px] flex-col gap-3 rounded-[20px] p-[22px] text-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-tarjeta"
            style={{ background: "linear-gradient(135deg, #0d2b4e, #1a5fb0)" }}
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-white/15">
              <MessageSquareText className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base leading-snug font-semibold">Buzón de sugerencias</h2>
              <p className="mt-1 text-[13px] text-white/75">
                Envía una sugerencia, queja, felicitación o no conformidad.
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 text-[12.5px] text-white/75">
              <span>Queda con número de radicado</span>
              <ChevronRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        </li>
      </ul>

      {editor && porVencer.data && porVencer.data.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-2 flex items-center gap-2 text-[18px] font-semibold">
            <span className="size-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
            Vencen en los próximos 7 días
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Renueva la vigencia o sube una versión nueva antes de que desaparezcan de la vista de los lectores.
          </p>
          <ListaDocumentos documentos={porVencer.data} mostrarArea resaltarVencimiento />
        </section>
      )}
    </>
  );
}
