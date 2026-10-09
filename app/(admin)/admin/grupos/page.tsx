/**
 * Panel · Grupos: los segmentos de personas, sus miembros y los permisos por
 * área que concede cada uno.
 */
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { GestionGrupos } from "@/components/admin/gestion-grupos";
import {
  listarAreasConEstado,
  listarGruposConDescripcion,
  listarMiembrosDeGrupos,
  listarPerfilesConRol,
  listarPermisosDeGrupos,
} from "@/lib/admin/datos";
import { exigirAdmin } from "@/lib/sesion";

export const metadata: Metadata = { title: "Grupos" };

export default async function PaginaGrupos() {
  const { supabase } = await exigirAdmin();

  // Las consultas son independientes: van en paralelo.
  const [grupos, areas, personas, miembros, permisos] = await Promise.all([
    listarGruposConDescripcion(supabase),
    listarAreasConEstado(supabase),
    listarPerfilesConRol(supabase),
    listarMiembrosDeGrupos(supabase),
    listarPermisosDeGrupos(supabase),
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
