import "server-only";

/**
 * Guardia de las pantallas de Calidad. Es `exigirModulo("calidad")` con una
 * puerta más: el team leader, que no tiene nivel sobre el cuadro pero está
 * enlazado en calidad_team_leaders, entra con alcance de EQUIPO.
 *
 * Qué ve y qué escribe cada uno lo decide RLS (migración 035): el team
 * leader recibe solo las auditorías de sus asesores, así que el dashboard,
 * la lista y el ranking por team leader se acotan solos a su equipo. Aquí
 * solo se decide la puerta y qué botones pintar.
 *
 * Con React cache, layout y página comparten el resultado en la petición.
 */
import { cache } from "react";
import { notFound } from "next/navigation";
import { puedeEditarArea, puedeEliminarArea } from "@/lib/permisos";
import { exigirSesion, type Sesion } from "@/lib/sesion";
import type { NivelAcceso } from "@/lib/supabase/tipos";

export type SesionCalidad = Sesion & {
  area: { id: string; nombre: string; slug: string; descripcion: string | null };
  /** Nivel sobre el cuadro; null para el team leader que entra solo por su equipo. */
  nivel: NivelAcceso | null;
  /** "todo": Calidad, coordinación y administradores. "equipo": team leader. */
  alcance: "todo" | "equipo";
  /** Configurar el módulo: pauta, estructura y retroalimentación. */
  puedeEditar: boolean;
  /** Crear, completar y publicar auditorías (el team leader, solo de su equipo). */
  puedeAuditar: boolean;
  puedeEliminar: boolean;
};

export const exigirCalidad = cache(async (): Promise<SesionCalidad> => {
  const sesion = await exigirSesion();

  const { data: area } = await sesion.supabase
    .from("areas")
    .select("id, nombre, slug, descripcion")
    .eq("modulo", "calidad")
    .eq("activa", true)
    .maybeSingle();
  if (!area) notFound();

  const [{ data: nivel }, { data: esTeamLeader }] = await Promise.all([
    sesion.supabase.rpc("nivel_en_area", { a: area.id }),
    sesion.supabase.rpc("calidad_soy_team_leader"),
  ]);
  if (!nivel && esTeamLeader !== true) notFound();

  const puedeEditar = nivel ? puedeEditarArea(nivel) : false;
  return {
    ...sesion,
    area,
    nivel: nivel ?? null,
    alcance: nivel ? "todo" : "equipo",
    puedeEditar,
    puedeAuditar: puedeEditar || esTeamLeader === true,
    puedeEliminar: sesion.perfil.rol === "admin" || (nivel ? puedeEliminarArea(nivel) : false),
  };
});
