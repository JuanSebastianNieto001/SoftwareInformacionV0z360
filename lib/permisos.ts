import type { NivelAcceso, Perfil, RolGlobal } from "./supabase/tipos";

/**
 * Helpers de PRESENTACIÓN. Sirven para decidir qué botones mostrar, no
 * para autorizar: la autorización real vive en RLS (Postgres). Si alguno
 * de estos helpers se equivoca, lo peor que pasa es un botón que al
 * pulsarlo devuelve "no autorizado".
 */

export function esAdmin(
  perfil: Pick<Perfil, "rol" | "activo"> | null | undefined,
): boolean {
  return !!perfil && perfil.activo && perfil.rol === "admin";
}

export function puedeSubir(
  perfil: Pick<Perfil, "rol" | "activo"> | null | undefined,
): boolean {
  return (
    !!perfil &&
    perfil.activo &&
    (perfil.rol === "admin" || perfil.rol === "editor")
  );
}

/**
 * Replica la lógica de public.nivel_en_area() para mostrar el nivel
 * efectivo en pantalla: el rol global es el techo.
 */
export function nivelEfectivo(
  rol: RolGlobal,
  activo: boolean,
  permiso: NivelAcceso | null | undefined,
): NivelAcceso | null {
  if (!activo) return null;
  if (rol === "admin") return "edicion";
  if (!permiso) return null;
  if (rol === "lector") return "lectura";
  return permiso;
}

export const ETIQUETA_ROL: Record<RolGlobal, string> = {
  admin: "Administrador",
  editor: "Editor",
  lector: "Lector",
};

export const DESCRIPCION_ROL: Record<RolGlobal, string> = {
  admin: "Administra usuarios, áreas y permisos. Ve todo y la auditoría.",
  editor: "Sube y edita documentos, solo en las áreas asignadas con edición.",
  lector: "Solo lectura, únicamente en las áreas asignadas.",
};

export const ETIQUETA_NIVEL: Record<NivelAcceso, string> = {
  lectura: "Lectura",
  edicion: "Edición",
};
