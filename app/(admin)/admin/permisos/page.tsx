/**
 * Panel · Permisos: la matriz por persona y área, mostrando también lo que
 * cada quien hereda de sus grupos.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { MatrizPermisos } from "@/components/admin/matriz-permisos";
import { EncabezadoPagina, EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { Button } from "@/components/ui/button";
import { exigirAdmin } from "@/lib/sesion";

export const metadata: Metadata = { title: "Permisos" };

export default async function PaginaPermisos({ searchParams }: PageProps<"/admin/permisos">) {
  const sp = await searchParams;
  const { supabase } = await exigirAdmin();

  const [
    { data: perfiles },
    { data: areas },
    { data: permisos },
    { data: grupos },
    { data: miembros },
    { data: permisosGrupo },
  ] = await Promise.all([
    supabase.from("perfiles").select("id, nombre, cargo, rol, activo").order("nombre"),
    supabase.from("areas").select("id, nombre, activa").order("nombre"),
    supabase.from("permisos_area").select("usuario_id, area_id, nivel"),
    supabase.from("grupos").select("id, nombre, activo").order("nombre"),
    supabase.from("grupos_usuarios").select("grupo_id, usuario_id"),
    supabase.from("permisos_grupo").select("grupo_id, area_id, nivel"),
  ]);

  const usuarioInicial = typeof sp.usuario === "string" ? sp.usuario : null;

  if (!areas || areas.length === 0) {
    return (
      <>
        <EncabezadoPagina kicker="Administración" titulo="Permisos" />
        <EstadoVacio
          titulo="Primero crea al menos un área"
          accion={
            <Button asChild>
              <Link href="/admin/areas">Ir a Áreas</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <EncabezadoPagina
        kicker="Administración"
        titulo="Permisos por área"
        descripcion="Aquí se concede a una persona en concreto. Lo que además le llegue por sus grupos se suma, y gana el mayor de los dos. El rol global sigue siendo el techo: un lector nunca pasa de descarga aunque se le marque Editar."
      />
      <MatrizPermisos
        usuarios={perfiles ?? []}
        areas={areas}
        permisos={permisos ?? []}
        grupos={grupos ?? []}
        miembros={miembros ?? []}
        permisosGrupo={permisosGrupo ?? []}
        usuarioInicial={usuarioInicial}
      />
    </>
  );
}
