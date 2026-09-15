import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EncabezadoPagina, EstadoVacio } from "@/components/encabezado-pagina";
import { FormularioSubida } from "@/components/formulario-subida";
import { Button } from "@/components/ui/button";
import { nivelEfectivo, puedeSubir } from "@/lib/permisos";
import { exigirSesion } from "@/lib/sesion";

export const metadata: Metadata = { title: "Subir documento" };

export default async function PaginaSubir({ searchParams }: PageProps<"/subir">) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirSesion();

  // Guardia de UI: los lectores no tienen nada que hacer aquí.
  if (!puedeSubir(perfil)) redirect("/");

  const [{ data: areas }, { data: permisos }] = await Promise.all([
    supabase.from("areas").select("id, nombre").eq("activa", true).order("nombre"),
    supabase.from("permisos_area").select("area_id, nivel").eq("usuario_id", perfil.id),
  ]);

  const nivelPorArea = new Map((permisos ?? []).map((p) => [p.area_id, p.nivel]));
  const areasEdicion = (areas ?? []).filter(
    (a) => nivelEfectivo(perfil.rol, perfil.activo, nivelPorArea.get(a.id)) === "edicion",
  );

  const areaInicial =
    typeof sp.area === "string" && areasEdicion.some((a) => a.id === sp.area) ? sp.area : null;

  return (
    <div className="mx-auto max-w-[720px]">
      <EncabezadoPagina
        kicker="Documentos"
        titulo="Subir documento"
        descripcion="El archivo se guarda en el área elegida y será visible para los lectores dentro de la ventana de vigencia."
      />

      {areasEdicion.length === 0 ? (
        <EstadoVacio
          titulo="No tienes áreas con permiso de edición"
          descripcion="Pide al administrador que te otorgue nivel de edición en al menos un área."
          accion={
            <Button variant="outline" asChild>
              <Link href="/">Volver</Link>
            </Button>
          }
        />
      ) : (
        <FormularioSubida areas={areasEdicion} areaInicial={areaInicial} />
      )}
    </div>
  );
}
