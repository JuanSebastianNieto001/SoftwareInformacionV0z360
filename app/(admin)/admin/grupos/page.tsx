import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { GestionGrupos } from "@/components/admin/gestion-grupos";
import { exigirAdmin } from "@/lib/sesion";

export const metadata: Metadata = { title: "Grupos" };

export default async function PaginaGrupos() {
  const { supabase } = await exigirAdmin();

  // Las cuatro consultas son independientes: van en paralelo.
  const [{ data: grupos }, { data: areas }, { data: personas }, { data: miembros }, { data: permisos }] =
    await Promise.all([
      supabase.from("grupos").select("id, nombre, descripcion, activo").order("nombre"),
      supabase.from("areas").select("id, nombre, activa").order("nombre"),
      supabase.from("perfiles").select("id, nombre, cargo, rol, activo").order("nombre"),
      supabase.from("grupos_usuarios").select("grupo_id, usuario_id"),
      supabase.from("permisos_grupo").select("grupo_id, area_id, nivel"),
    ]);

  return (
    <>
      <EncabezadoPagina
        kicker="Administración"
        titulo="Grupos"
        descripcion="Reúne a quienes hacen el mismo trabajo y dales los permisos una sola vez. Lo que concede un grupo se suma a lo que cada persona tenga por su cuenta: siempre gana el mayor de los dos."
      />
      <GestionGrupos
        grupos={grupos ?? []}
        areas={areas ?? []}
        personas={personas ?? []}
        miembros={miembros ?? []}
        permisos={permisos ?? []}
      />
    </>
  );
}
