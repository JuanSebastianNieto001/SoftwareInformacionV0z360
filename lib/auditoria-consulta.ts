import type { ClienteServidor } from "./supabase/server";
import { finDeDiaIso, inicioDeDiaIso } from "./formato";
import { esquemaFiltrosAuditoria, type FiltrosAuditoria } from "./validaciones";

export const COLUMNAS_AUDITORIA =
  "id, ocurrio_en, usuario_id, usuario_nombre, usuario_email, accion, documento_id, doc_titulo, area_nombre, ip, user_agent" as const;

/** Convierte los searchParams (strings sueltos) en filtros validados. Lo inválido se ignora. */
export function filtrosDesdeParams(sp: Record<string, string | string[] | undefined>): FiltrosAuditoria {
  const plano: Record<string, string> = {};
  for (const clave of ["usuario", "documento", "accion", "desde", "hasta", "q"] as const) {
    const v = sp[clave];
    if (typeof v === "string" && v.trim() !== "") plano[clave] = v.trim();
  }
  const parsed = esquemaFiltrosAuditoria.safeParse(plano);
  if (parsed.success) return parsed.data;

  // Si algún campo es inválido, lo quitamos y reintentamos con el resto.
  const invalidos = new Set(parsed.error.issues.map((i) => String(i.path[0])));
  for (const k of invalidos) delete plano[k];
  const segundo = esquemaFiltrosAuditoria.safeParse(plano);
  return segundo.success ? segundo.data : {};
}

/** Los filtros como query string, para el enlace de exportación y la paginación. */
export function filtrosAQuery(f: FiltrosAuditoria): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/**
 * Construye la consulta a `accesos` con los filtros. Usa el cliente de
 * sesión: si quien consulta no es admin, RLS devuelve cero filas.
 */
export function consultaAuditoria(
  supabase: ClienteServidor,
  filtros: FiltrosAuditoria,
  opciones: { limite: number; conteo?: boolean },
) {
  let q = supabase
    .from("accesos")
    .select(COLUMNAS_AUDITORIA, opciones.conteo ? { count: "exact" } : undefined)
    .order("ocurrio_en", { ascending: false })
    .limit(opciones.limite);

  if (filtros.usuario) q = q.eq("usuario_id", filtros.usuario);
  if (filtros.documento) q = q.eq("documento_id", filtros.documento);
  if (filtros.accion) q = q.eq("accion", filtros.accion);
  if (filtros.desde) q = q.gte("ocurrio_en", inicioDeDiaIso(filtros.desde));
  if (filtros.hasta) q = q.lte("ocurrio_en", finDeDiaIso(filtros.hasta));
  if (filtros.q) {
    const texto = filtros.q.replace(/[,()%_\\]/g, " ").trim();
    if (texto) {
      q = q.or(
        `doc_titulo.ilike.%${texto}%,usuario_nombre.ilike.%${texto}%,usuario_email.ilike.%${texto}%,area_nombre.ilike.%${texto}%`,
      );
    }
  }
  return q;
}

export const ETIQUETA_ACCION: Record<string, string> = {
  listar: "Listó",
  abrir: "Abrió",
  descargar: "Descargó",
  subir: "Subió",
  editar: "Editó",
  eliminar: "Eliminó",
  login: "Inició sesión",
};
