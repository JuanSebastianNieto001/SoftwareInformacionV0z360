import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import type { Modulo } from "./modulos";
import { puedeEditarArea, puedeEliminarArea } from "./permisos";
import { exigirSesion, type Sesion } from "./sesion";
import type { NivelAcceso } from "./supabase/tipos";

export type SesionModulo = Sesion & {
  area: { id: string; nombre: string; slug: string; descripcion: string | null };
  nivel: NivelAcceso;
  puedeEditar: boolean;
  puedeEliminar: boolean;
};

/**
 * Guardia de las pantallas de un cuadro-módulo (/evaluacion, /cumpleanos).
 *
 * Un módulo es un área, así que la pregunta "¿puede entrar?" la responde
 * RLS igual que con cualquier cuadro: si la fila de `areas` no vuelve, no
 * hay permiso y la URL responde 404. No hay una lista de correos en el
 * código que haya que mantener.
 *
 * Con React cache, layout y página comparten el resultado en la misma
 * petición.
 */
export const exigirModulo = cache(async (modulo: Modulo): Promise<SesionModulo> => {
  const sesion = await exigirSesion();

  const { data: area } = await sesion.supabase
    .from("areas")
    .select("id, nombre, slug, descripcion")
    .eq("modulo", modulo)
    .eq("activa", true)
    .maybeSingle();
  if (!area) notFound();

  const { data: nivel } = await sesion.supabase.rpc("nivel_en_area", { a: area.id });
  if (!nivel) notFound();

  return {
    ...sesion,
    area,
    nivel,
    puedeEditar: puedeEditarArea(nivel),
    puedeEliminar: sesion.perfil.rol === "admin" || puedeEliminarArea(nivel),
  };
});
