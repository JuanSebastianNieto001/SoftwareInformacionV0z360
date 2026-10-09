import "server-only";

/**
 * Capa de lectura del núcleo documental: las áreas (cuadros) que ve quien
 * navega, los documentos y su trazabilidad. Es el equivalente a los
 * «modelos»: las páginas piden aquí los datos y se quedan con la guardia,
 * los parámetros y la presentación.
 *
 * Reglas de esta capa:
 *  - Solo lecturas. Las escrituras, el Storage y la auditoría viven en las
 *    rutas de app/api/documentos.
 *  - Cada función recibe el cliente de la sesión (crearClienteServidor) y
 *    RLS decide qué filas vuelven: sin permiso sobre un área, sus filas no
 *    existen para quien consulta. Aquí no hay chequeos de permisos en
 *    TypeScript.
 *  - Ninguna función usa el cliente de servicio (service_role).
 *  - Las listas devuelven `data ?? []` y las búsquedas de una fila, `data`
 *    (null si RLS la oculta o no existe). Donde la pantalla muestra el error
 *    de la consulta, se devuelve junto a las filas.
 */
import { isoDentroDe } from "@/lib/formato";
import type { ClienteServidor } from "@/lib/supabase/server";
import type { EstadoDocumento } from "@/lib/supabase/tipos";
import { ESTADOS } from "@/lib/validaciones";

/** Columnas que pinta ListaDocumentos: las mismas en el inicio, el área y el panel. */
const COLUMNAS_LISTA =
  "id, titulo, nombre_archivo, tamano_bytes, vigente_desde, vigente_hasta, estado, area_nombre, version, veces_consultado, usuarios_distintos, actualizado_en" as const;

// ---------------------------------------------------------------------------
// Áreas y niveles
// ---------------------------------------------------------------------------

/**
 * Áreas activas que ve quien navega, ordenadas por nombre, con el conteo de
 * sus documentos (`documentos(count)`) y la columna `modulo` para distinguir
 * los cuadros-módulo. Acceso: RLS solo devuelve las áreas donde
 * nivel_en_area() no es null (el admin, todas); el conteo embebido también
 * pasa por la RLS de documentos.
 */
export async function listarAreasVisibles(supabase: ClienteServidor) {
  const { data } = await supabase
    .from("areas")
    .select("id, nombre, slug, descripcion, modulo, documentos(count)")
    .eq("activa", true)
    .order("nombre");
  return data ?? [];
}

/**
 * Áreas activas que reciben documentos (sin cuadros-módulo: `modulo` es
 * null), solo id y nombre, ordenadas por nombre. Es el universo del selector
 * de «Subir documento»; en cuáles se tiene edición lo decide la página con
 * los niveles. Acceso: RLS devuelve solo las áreas visibles.
 */
export async function listarAreasParaSubir(supabase: ClienteServidor) {
  const { data } = await supabase
    .from("areas")
    .select("id, nombre")
    .eq("activa", true)
    .is("modulo", null)
    .order("nombre");
  return data ?? [];
}

/**
 * Permisos directos de una persona (`permisos_area`: área y nivel), sin
 * orden. No incluye lo heredado de grupos. Acceso: RLS deja ver los propios
 * (y todos al admin).
 */
export async function listarNivelesPropios(supabase: ClienteServidor, usuarioId: string) {
  const { data } = await supabase
    .from("permisos_area")
    .select("area_id, nivel")
    .eq("usuario_id", usuarioId);
  return data ?? [];
}

/**
 * El área con ese slug (id, nombre, slug, descripción, activa, módulo), o
 * null. Acceso: RLS; sin permiso sobre el área la fila no vuelve y la página
 * responde 404.
 */
export async function buscarAreaPorSlug(supabase: ClienteServidor, slug: string) {
  const { data } = await supabase
    .from("areas")
    .select("id, nombre, slug, descripcion, activa, modulo")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

/**
 * Solo el slug del área con ese id, o null (para el enlace de vuelta del
 * detalle). Acceso: RLS de áreas.
 */
export async function buscarSlugDeArea(supabase: ClienteServidor, areaId: string) {
  const { data } = await supabase.from("areas").select("slug").eq("id", areaId).maybeSingle();
  return data;
}

/**
 * Nivel efectivo de quien navega en el área (rpc `nivel_en_area`: combina
 * permiso directo, grupos y rol), o null si no tiene acceso. Es la misma
 * función que usan las políticas RLS.
 */
export async function nivelEnArea(supabase: ClienteServidor, areaId: string) {
  const { data } = await supabase.rpc("nivel_en_area", { a: areaId });
  return data;
}

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

/** Filtros de la lista de documentos; los textos ya vienen saneados por la página. */
export type FiltrosListaDocumentos = {
  /** Solo los de esta área (vacío: todas las visibles). */
  areaId?: string;
  /** Texto buscado en título o descripción (ya limpio con limpiarBusqueda). */
  q?: string;
  /** Solo los de este estado de vigencia (vacío: todos). */
  estado?: EstadoDocumento | "";
  /** Tope de filas. */
  limite: number;
};

/**
 * Documentos de `v_documentos_estado` con las columnas de la lista, del más
 * nuevo al más antiguo (`creado_en` desc) y hasta `limite` filas, filtrados
 * por área, texto (título o descripción, ilike) y estado. Devuelve las filas
 * (`data ?? []`) y el error, que la pantalla muestra. Acceso: la vista es
 * security_invoker, así que aplica la RLS de documentos: un lector solo ve
 * lo vigente; quien edita y el admin ven también programados, vencidos y
 * purgados.
 */
export async function listarDocumentos(supabase: ClienteServidor, filtros: FiltrosListaDocumentos) {
  let consulta = supabase
    .from("v_documentos_estado")
    .select(COLUMNAS_LISTA)
    .order("creado_en", { ascending: false })
    .limit(filtros.limite);

  if (filtros.areaId) consulta = consulta.eq("area_id", filtros.areaId);
  if (filtros.q) consulta = consulta.or(`titulo.ilike.%${filtros.q}%,descripcion.ilike.%${filtros.q}%`);
  if (filtros.estado) consulta = consulta.eq("estado", filtros.estado);

  const { data, error } = await consulta;
  return { documentos: data ?? [], error };
}

/**
 * Documentos vigentes que vencen en los próximos 7 días (con fecha de fin no
 * nula), del que vence antes al que vence después, hasta 20. Columnas de la
 * lista. Acceso: RLS de documentos; la página solo lo pide a quien puede
 * publicar.
 */
export async function listarDocumentosPorVencer(supabase: ClienteServidor) {
  const { data } = await supabase
    .from("v_documentos_estado")
    .select(COLUMNAS_LISTA)
    .eq("estado", "vigente")
    .not("vigente_hasta", "is", null)
    .lte("vigente_hasta", isoDentroDe(7))
    .order("vigente_hasta", { ascending: true })
    .limit(20);
  return data ?? [];
}

/**
 * Cuántos documentos hay en cada estado, en el mismo orden que ESTADOS
 * (consultas `head` con conteo exacto, en paralelo). `count` es null si la
 * consulta falla. Acceso: RLS de documentos; lo usa el panel del admin.
 */
export async function contarDocumentosPorEstado(supabase: ClienteServidor) {
  const respuestas = await Promise.all(
    ESTADOS.map((estado) =>
      supabase.from("v_documentos_estado").select("id", { count: "exact", head: true }).eq("estado", estado),
    ),
  );
  return respuestas.map(({ count }, i) => ({ estado: ESTADOS[i], count }));
}

/**
 * Un documento con todas las columnas de `v_documentos_estado` (estado,
 * área, subido por, consultas…), o null. Acceso: RLS; si no tiene permiso
 * sobre el área, o es lector y el documento está fuera de vigencia, no
 * existe.
 */
export async function buscarDocumento(supabase: ClienteServidor, id: string) {
  const { data } = await supabase.from("v_documentos_estado").select("*").eq("id", id).maybeSingle();
  return data;
}

/**
 * Lo que necesita el formulario de edición de un documento (metadatos,
 * archivo, versión, vigencia, purga y el nombre de su área), leído de la
 * tabla `documentos`, o null. Acceso: RLS de documentos; el nivel de edición
 * lo comprueba la página con nivelEnArea().
 */
export async function buscarDocumentoParaEditar(supabase: ClienteServidor, id: string) {
  const { data } = await supabase
    .from("documentos")
    .select(
      "id, area_id, titulo, descripcion, etiquetas, nombre_archivo, mime, tamano_bytes, version, vigente_desde, vigente_hasta, purgado_en, areas(nombre)",
    )
    .eq("id", id)
    .maybeSingle();
  return data;
}

// ---------------------------------------------------------------------------
// Trazabilidad de un documento
// ---------------------------------------------------------------------------

/**
 * Las últimas 100 aperturas y descargas registradas de un documento (quién,
 * qué, cuándo, IP), de la más reciente a la más antigua. Acceso: RLS de
 * `accesos`, que solo deja leer al admin.
 */
export async function listarAccesosDelDocumento(supabase: ClienteServidor, documentoId: string) {
  const { data } = await supabase
    .from("accesos")
    .select("id, usuario_nombre, usuario_email, accion, ocurrio_en, ip")
    .eq("documento_id", documentoId)
    .in("accion", ["abrir", "descargar"])
    .order("ocurrio_en", { ascending: false })
    .limit(100);
  return data ?? [];
}

/**
 * Personas activas con permiso directo sobre el área del documento que aún
 * no lo han abierto ni descargado (rpc `pendientes_de_leer`: id, nombre y
 * correo). La función es security definer y solo devuelve filas si quien
 * llama es admin.
 */
export async function listarPendientesDeLeer(supabase: ClienteServidor, documentoId: string) {
  const { data } = await supabase.rpc("pendientes_de_leer", { doc: documentoId });
  return data ?? [];
}
