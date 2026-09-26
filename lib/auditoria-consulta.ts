import type { ClienteServidor } from "./supabase/server";
import { finDeDiaIso, inicioDeDiaIso } from "./formato";
import { esquemaFiltrosAuditoria, type FiltrosAuditoria } from "./validaciones";

/** UUID imposible: filtra a cero filas sin inventar sintaxis. */
const VACIO = "00000000-0000-0000-0000-000000000000";

export const COLUMNAS_AUDITORIA =
  "id, ocurrio_en, usuario_id, usuario_nombre, usuario_email, accion, documento_id, doc_titulo, area_nombre, ip, user_agent" as const;

/** Convierte los searchParams (strings sueltos) en filtros validados. Lo inválido se ignora. */
export function filtrosDesdeParams(sp: Record<string, string | string[] | undefined>): FiltrosAuditoria {
  const plano: Record<string, string> = {};
  for (const clave of ["usuario", "grupo", "documento", "accion", "desde", "hasta", "q"] as const) {
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
  opciones: {
    limite: number;
    conteo?: boolean;
    /**
     * Los ids de quienes están en el grupo filtrado. Se resuelven fuera y se
     * pasan ya hechos porque `accesos` guarda el nombre y el correo de quien
     * actuó, no su pertenencia: la auditoría tiene que seguir siendo legible
     * aunque después se borre el grupo o se saque a la persona de él.
     * Un array vacío significa "grupo sin miembros" y no devuelve nada.
     */
    miembros?: string[] | null;
  },
) {
  let q = supabase
    .from("accesos")
    .select(COLUMNAS_AUDITORIA, opciones.conteo ? { count: "exact" } : undefined)
    .order("ocurrio_en", { ascending: false })
    .limit(opciones.limite);

  if (filtros.usuario) q = q.eq("usuario_id", filtros.usuario);
  if (opciones.miembros) {
    q = opciones.miembros.length > 0 ? q.in("usuario_id", opciones.miembros) : q.eq("usuario_id", VACIO);
  }
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

/**
 * Ids de quienes pertenecen al grupo filtrado, o null si no se filtra por
 * grupo. Se consulta aparte y no con un join porque `accesos` no guarda la
 * pertenencia: guarda quién actuó, con su nombre y correo de entonces.
 */
export async function miembrosDelGrupo(
  supabase: ClienteServidor,
  grupoId: string | undefined,
): Promise<string[] | null> {
  if (!grupoId) return null;
  const { data } = await supabase
    .from("grupos_usuarios")
    .select("usuario_id")
    .eq("grupo_id", grupoId);
  return (data ?? []).map((m) => m.usuario_id);
}
