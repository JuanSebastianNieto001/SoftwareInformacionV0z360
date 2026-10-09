import "server-only";

/**
 * Capa de lectura del panel de administración: áreas, personas, grupos y
 * permisos (la auditoría se arma con lib/auditoria/consulta.ts, que comparte
 * filtros con la exportación CSV).
 *
 * Reglas de esta capa:
 *  - Solo lecturas. Crear, editar, activar y conceder vive en las rutas de
 *    app/api/admin.
 *  - Cada función recibe el cliente de la sesión (crearClienteServidor) y
 *    RLS decide qué filas vuelven: las tablas de permisos y membresías solo
 *    se leen enteras siendo admin (soy_admin()); a otro le volverían solo
 *    las suyas o nada. Aquí no hay chequeos de permisos en TypeScript: la
 *    guardia de navegación es exigirAdmin() en el layout y las páginas.
 *  - Ninguna función usa el cliente de servicio (service_role). La lista de
 *    usuarios, que necesita los correos de auth.users, se carga en el
 *    cliente desde /api/admin/usuarios y no pasa por aquí.
 *  - Las listas devuelven `data ?? []`.
 */
import type { ClienteServidor } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Áreas
// ---------------------------------------------------------------------------

/**
 * Todas las áreas (activas o no), ordenadas por nombre, con sus datos de
 * gestión y dos conteos embebidos: documentos y permisos directos. Acceso:
 * RLS; el admin las ve todas.
 */
export async function listarAreasConConteos(supabase: ClienteServidor) {
  const { data } = await supabase
    .from("areas")
    .select("id, nombre, slug, descripcion, activa, creado_en, documentos(count), permisos_area(count)")
    .order("nombre");
  return data ?? [];
}

/**
 * Todas las áreas con id, nombre y si están activas, ordenadas por nombre:
 * las columnas de la matriz de permisos y de los permisos de grupo. Acceso:
 * RLS; el admin las ve todas.
 */
export async function listarAreasConEstado(supabase: ClienteServidor) {
  const { data } = await supabase.from("areas").select("id, nombre, activa").order("nombre");
  return data ?? [];
}

/**
 * Todas las áreas, solo id y nombre, ordenadas por nombre: el selector de
 * área de los filtros. Acceso: RLS; el admin las ve todas.
 */
export async function listarAreasParaFiltro(supabase: ClienteServidor) {
  const { data } = await supabase.from("areas").select("id, nombre").order("nombre");
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

/**
 * Todos los perfiles (activos o no) con nombre, cargo, rol y estado,
 * ordenados por nombre. Acceso: RLS de perfiles (lectura para cualquiera con
 * sesión).
 */
export async function listarPerfilesConRol(supabase: ClienteServidor) {
  const { data } = await supabase.from("perfiles").select("id, nombre, cargo, rol, activo").order("nombre");
  return data ?? [];
}

/**
 * Todos los perfiles, solo id y nombre, ordenados por nombre: el selector de
 * persona de los filtros. Acceso: RLS de perfiles (lectura para cualquiera
 * con sesión).
 */
export async function listarPerfilesParaFiltro(supabase: ClienteServidor) {
  const { data } = await supabase.from("perfiles").select("id, nombre").order("nombre");
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------------

/**
 * Todos los grupos con descripción y estado, ordenados por nombre. Acceso:
 * RLS de grupos (los nombres los lee cualquiera con sesión).
 */
export async function listarGruposConDescripcion(supabase: ClienteServidor) {
  const { data } = await supabase.from("grupos").select("id, nombre, descripcion, activo").order("nombre");
  return data ?? [];
}

/**
 * Todos los grupos con id, nombre y si están activos, ordenados por nombre.
 * Acceso: RLS de grupos (los nombres los lee cualquiera con sesión).
 */
export async function listarGruposConEstado(supabase: ClienteServidor) {
  const { data } = await supabase.from("grupos").select("id, nombre, activo").order("nombre");
  return data ?? [];
}

/**
 * Todos los grupos, solo id y nombre, ordenados por nombre: el selector de
 * segmento de los filtros. Acceso: RLS de grupos (los nombres los lee
 * cualquiera con sesión).
 */
export async function listarGruposParaFiltro(supabase: ClienteServidor) {
  const { data } = await supabase.from("grupos").select("id, nombre").order("nombre");
  return data ?? [];
}

/**
 * Todas las membresías (pares grupo-persona), sin orden. Acceso: RLS; el
 * admin ve todas, cualquier otro solo las suyas.
 */
export async function listarMiembrosDeGrupos(supabase: ClienteServidor) {
  const { data } = await supabase.from("grupos_usuarios").select("grupo_id, usuario_id");
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Permisos
// ---------------------------------------------------------------------------

/**
 * Todos los permisos directos por persona (`permisos_area`: persona, área y
 * nivel), sin orden. Acceso: RLS; el admin ve todos, cualquier otro solo los
 * suyos.
 */
export async function listarPermisosPorPersona(supabase: ClienteServidor) {
  const { data } = await supabase.from("permisos_area").select("usuario_id, area_id, nivel");
  return data ?? [];
}

/**
 * Todos los permisos que concede cada grupo (`permisos_grupo`: grupo, área y
 * nivel), sin orden. Acceso: RLS; solo el admin los lee.
 */
export async function listarPermisosDeGrupos(supabase: ClienteServidor) {
  const { data } = await supabase.from("permisos_grupo").select("grupo_id, area_id, nivel");
  return data ?? [];
}
