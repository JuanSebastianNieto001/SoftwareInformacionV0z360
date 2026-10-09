import "server-only";

/**
 * Capa de lectura del módulo de Calidad (el equivalente a los «modelos»).
 *
 * Aquí viven las consultas de solo lectura de /calidad, /mis-evaluaciones,
 * /ranking y la exportación a CSV. Las escrituras siguen en las acciones de
 * servidor (app/acciones/calidad.ts).
 *
 * Todas las funciones reciben el cliente de Supabase de la sesión
 * (crearClienteServidor): cada consulta corre con la identidad de quien
 * navega y es RLS quien decide qué filas vuelven. Aquí no hay chequeos de
 * permisos en TypeScript: la guardia de cada pantalla (exigirCalidad o
 * exigirSesion) decide si se entra y la base decide qué se ve.
 *
 * Convención: se devuelve `data` tal como lo entrega Supabase (null si la
 * lectura falla) y cada pantalla conserva su `?? []`; cuando la pantalla
 * muestra el error, la función devuelve `{ data, error }`.
 */
import type { ClienteServidor } from "@/lib/supabase/server";
import type { EstadoEvaluacionCalidad } from "@/lib/supabase/tipos";

export type FiltrosDashboardCalidad = {
  /** Mes AAAA-MM; se ignora si `todos` es true. */
  mes: string;
  todos: boolean;
  /** Team leader; vacío = todos. */
  tl: string;
  /** Nombre del analista que auditó; vacío = todos. */
  auditor: string;
};

export type FiltrosAuditorias = {
  /** Parte del nombre del asesor; vacío = todos. */
  q: string;
  tl: string;
  estado: "" | EstadoEvaluacionCalidad;
  /** Fecha de auditoría desde (inclusive), AAAA-MM-DD; vacío = sin límite. */
  desde: string;
  /** Fecha de auditoría hasta (inclusive), AAAA-MM-DD; vacío = sin límite. */
  hasta: string;
};

/**
 * Team leaders distintos de la estructura operativa, ordenados, para los
 * filtros del dashboard y del listado de auditorías.
 *
 * RLS: quien tiene el cuadro de Calidad ve toda la estructura; un asesor,
 * solo su propia fila.
 */
export async function listarTeamLeadersCalidad(supabase: ClienteServidor): Promise<string[]> {
  const { data: tls } = await supabase.from("calidad_asesores").select("team_leader").not("team_leader", "is", null);
  return [...new Set((tls ?? []).map((t) => t.team_leader as string))].sort();
}

/**
 * Todo lo que lee el dashboard de calidad: auditorías publicadas del
 * periodo (hasta 5000), team leaders, ítems activos de la pauta, auditores
 * con su número de auditorías, auditorías publicadas por mes, fallas («no
 * cumple») de auditorías publicadas del periodo y compromisos (hasta 5000).
 *
 * Filtros: `mes` (o `todos`), `tl` y `auditor`. Los conteos por mes no se
 * acotan al mes (alimentan las pastillas) pero sí a auditor y team leader;
 * la lista de auditores y los compromisos no se filtran.
 *
 * RLS: quien tiene el cuadro de Calidad ve todas las auditorías;
 * calidad_auditores y calidad_conteo_meses son security invoker, así que
 * cuentan solo lo que RLS deja ver.
 */
export async function cargarDashboardCalidad(supabase: ClienteServidor, { mes, todos, tl, auditor }: FiltrosDashboardCalidad) {
  let consulta = supabase
    .from("v_calidad_evaluaciones")
    .select("id, asesor_id, asesor_nombre, team_leader, nota_final, nota_sin_ic, nota_minima, aprobada, n_fatales_fallados, retro_estado, canal, tipo")
    .eq("estado", "publicada")
    .limit(5000);
  // Rango [día 1, día 1 del mes siguiente): "-31" era una fecha inválida en
  // los meses de 30 días y la consulta entera fallaba (septiembre vacío).
  const inicioSiguiente = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1)).toISOString().slice(0, 10);
  if (!todos) consulta = consulta.gte("fecha_auditoria", `${mes}-01`).lt("fecha_auditoria", inicioSiguiente);
  if (tl) consulta = consulta.eq("team_leader", tl);
  if (auditor) consulta = consulta.eq("analista_nombre", auditor);

  const [{ data: evals }, teamLeaders, { data: items }, { data: auditores }, { data: conteos }] = await Promise.all([
    consulta,
    listarTeamLeadersCalidad(supabase),
    supabase.from("calidad_items").select("id, categoria, descripcion, es_fatal").eq("activo", true),
    supabase.rpc("calidad_auditores"),
    supabase.rpc("calidad_conteo_meses", { p_auditor: auditor || null, p_team_leader: tl || null }),
  ]);

  // Las fallas se filtran con un join embebido (mismos filtros del periodo):
  // pasar cientos de ids por la URL rompía la petición con «mes: todo». El
  // servidor corta cada respuesta en 1000 filas, así que se pagina.
  const fallas: { item_id: string }[] = [];
  for (let pagina = 0; pagina < 20; pagina++) {
    let consultaFallas = supabase
      .from("calidad_respuestas")
      .select("item_id, calidad_evaluaciones!inner(id)")
      .eq("resultado", "no_cumple")
      .eq("calidad_evaluaciones.estado", "publicada")
      .range(pagina * 1000, pagina * 1000 + 999);
    if (!todos) consultaFallas = consultaFallas.gte("calidad_evaluaciones.fecha_auditoria", `${mes}-01`).lt("calidad_evaluaciones.fecha_auditoria", inicioSiguiente);
    if (tl) consultaFallas = consultaFallas.eq("calidad_evaluaciones.team_leader", tl);
    if (auditor) consultaFallas = consultaFallas.eq("calidad_evaluaciones.analista_nombre", auditor);
    const { data: tramo } = await consultaFallas.returns<{ item_id: string }[]>();
    fallas.push(...(tramo ?? []));
    if (!tramo || tramo.length < 1000) break;
  }
  const { data: compromisos } = await supabase.from("calidad_compromisos").select("estado, fecha_limite").limit(5000);

  return { evals, teamLeaders, items, auditores, conteos, fallas, compromisos };
}

/**
 * Listado de auditorías (borradores y publicadas): las 500 más recientes
 * por fecha de auditoría y, a igual fecha, por creación.
 *
 * Filtros: `q` (parte del nombre del asesor, sin distinguir mayúsculas),
 * `tl`, `estado`, `desde` y `hasta`; vacíos = sin filtro. Devuelve
 * `{ data, error }` porque la pantalla muestra el error.
 *
 * RLS: quien tiene el cuadro de Calidad ve todas; un asesor, solo las suyas
 * publicadas.
 */
export async function listarAuditorias(supabase: ClienteServidor, { q, tl, estado, desde, hasta }: FiltrosAuditorias) {
  let consulta = supabase
    .from("v_calidad_evaluaciones")
    .select("id, asesor_nombre, team_leader, analista_id, analista_nombre, fecha_interaccion, fecha_auditoria, tipo, etapa, estado, nota_final, nota_minima, n_fatales_fallados, retro_estado")
    .order("fecha_auditoria", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(500);
  if (q) consulta = consulta.ilike("asesor_nombre", `%${q}%`);
  if (tl) consulta = consulta.eq("team_leader", tl);
  if (estado) consulta = consulta.eq("estado", estado);
  if (desde) consulta = consulta.gte("fecha_auditoria", desde);
  if (hasta) consulta = consulta.lte("fecha_auditoria", hasta);
  const { data, error } = await consulta;
  return { data, error };
}

/**
 * Cuántos borradores dejó sin publicar quien audita (`analistaId`), para el
 * botón «Publicar» en lote. null si el conteo falla.
 *
 * RLS: quien tiene el cuadro de Calidad (los borradores no son visibles
 * para nadie más).
 */
export async function contarMisBorradores(supabase: ClienteServidor, analistaId: string) {
  const { count } = await supabase.from("calidad_evaluaciones").select("id", { count: "exact", head: true }).eq("estado", "borrador").eq("analista_id", analistaId);
  return count;
}

/**
 * Auditorías para exportar a CSV con los filtros del listado: hasta 5000,
 * las más recientes por fecha de auditoría. `estado` llega tal cual de la
 * URL y solo filtra si es «borrador» o «publicada». Devuelve
 * `{ data, error }`.
 *
 * RLS: quien tiene el cuadro de Calidad ve todas; sin acceso, el archivo
 * sale vacío.
 */
export async function listarAuditoriasParaCsv(supabase: ClienteServidor, { q, tl, estado, desde, hasta }: Omit<FiltrosAuditorias, "estado"> & { estado: string }) {
  let consulta = supabase
    .from("v_calidad_evaluaciones")
    .select("fecha_auditoria, fecha_interaccion, asesor_nombre, team_leader, analista_nombre, tipo, etapa, canal, duracion, referencia, estado, nota_sin_ic, nota_final, aprobada, n_no_cumple, n_fatales_fallados, retro_estado, puntos_mejora")
    .order("fecha_auditoria", { ascending: false })
    .limit(5000);
  if (q) consulta = consulta.ilike("asesor_nombre", `%${q}%`);
  if (tl) consulta = consulta.eq("team_leader", tl);
  if (estado === "borrador" || estado === "publicada") consulta = consulta.eq("estado", estado);
  if (desde) consulta = consulta.gte("fecha_auditoria", desde);
  if (hasta) consulta = consulta.lte("fecha_auditoria", hasta);
  const { data, error } = await consulta;
  return { data, error };
}

/**
 * Una auditoría con su nota calculada (todas las columnas de
 * v_calidad_evaluaciones), o null si no existe o RLS no la entrega.
 *
 * RLS: quien tiene el cuadro de Calidad; el asesor, solo la suya publicada.
 */
export async function obtenerAuditoria(supabase: ClienteServidor, id: string) {
  const { data } = await supabase.from("v_calidad_evaluaciones").select("*").eq("id", id).maybeSingle();
  return data;
}

/**
 * Si quien navega puede eliminar auditorías: solo quien tiene nivel Total
 * explícito en Calidad (coordinación de Formación). null si la consulta
 * falla.
 *
 * RLS: la decide la función calidad_puede_eliminar() con auth.uid().
 */
export async function puedeEliminarAuditorias(supabase: ClienteServidor) {
  const { data } = await supabase.rpc("calidad_puede_eliminar");
  return data;
}

/**
 * Opciones de los selectores del formulario de auditoría: matrices (con si
 * están activas) y asesores de la estructura (con su team leader y si están
 * activos), ambos por nombre.
 *
 * RLS: las matrices son de lectura general; la estructura, del cuadro de
 * Calidad.
 */
export async function cargarOpcionesFormularioAuditoria(supabase: ClienteServidor) {
  const [{ data: matrices }, { data: asesores }] = await Promise.all([
    supabase.from("calidad_matrices").select("id, nombre, activa").order("nombre"),
    supabase.from("calidad_asesores").select("id, nombre, team_leader, activo").order("nombre"),
  ]);
  return { matrices, asesores };
}

/**
 * El resto de una auditoría ya cargada: ítems de su pauta en orden, lo
 * marcado en cada ítem, la retroalimentación (o null) con sus compromisos
 * por fecha límite, y las opciones del formulario de edición.
 *
 * Filtros: `id` de la auditoría y `matrizId` de su pauta.
 *
 * RLS: quien tiene el cuadro de Calidad; el asesor, solo lo de su auditoría
 * publicada.
 */
export async function cargarDetalleAuditoria(supabase: ClienteServidor, { id, matrizId }: { id: string; matrizId: string }) {
  const [{ data: items }, { data: respuestas }, { data: retro }, { matrices, asesores }] = await Promise.all([
    supabase.from("calidad_items").select("*").eq("matriz_id", matrizId).order("orden"),
    supabase.from("calidad_respuestas").select("item_id, resultado, hallazgo").eq("evaluacion_id", id),
    supabase.from("calidad_retroalimentaciones").select("*").eq("evaluacion_id", id).maybeSingle(),
    cargarOpcionesFormularioAuditoria(supabase),
  ]);
  const { data: compromisos } = retro
    ? await supabase.from("calidad_compromisos").select("*").eq("retro_id", retro.id).order("fecha_limite")
    : { data: [] };
  return { items, respuestas, retro, matrices, asesores, compromisos };
}

/**
 * La pauta vigente para el editor: la matriz activa (o, si ninguna lo está,
 * la de versión más alta), sus ítems en orden y la tabla de penalización.
 * null si no hay ninguna matriz.
 *
 * RLS: pauta y penalización son de lectura general; editarlas es del cuadro
 * de Calidad.
 */
export async function cargarPautaVigente(supabase: ClienteServidor) {
  const { data: matriz } = await supabase.from("calidad_matrices").select("*").order("activa", { ascending: false }).order("version", { ascending: false }).limit(1).maybeSingle();
  if (!matriz) return null;
  const [{ data: items }, { data: penalizaciones }] = await Promise.all([
    supabase.from("calidad_items").select("*").eq("matriz_id", matriz.id).order("orden"),
    supabase.from("calidad_penalizaciones").select("*").order("orden"),
  ]);
  return { matriz, items, penalizaciones };
}

/**
 * La estructura operativa completa (activos e inactivos) por team leader y
 * nombre, y los perfiles activos por nombre para vincular cuentas.
 *
 * RLS: la estructura la ve el cuadro de Calidad; los perfiles son de
 * lectura general para quien tiene sesión.
 */
export async function cargarEstructuraOperativa(supabase: ClienteServidor) {
  const [{ data: asesores }, { data: perfiles }] = await Promise.all([
    supabase.from("calidad_asesores").select("*").order("team_leader").order("nombre"),
    supabase.from("perfiles").select("id, nombre").eq("activo", true).order("nombre"),
  ]);
  return { asesores, perfiles };
}

/**
 * Los enlaces entre el nombre de team leader de la estructura
 * (calidad_asesores.team_leader, tal cual) y su cuenta en la app, por
 * nombre. Un nombre enlazado da a esa cuenta acceso a auditar a su equipo.
 * [] si la lectura falla.
 *
 * RLS: los ve quien tiene el cuadro de Calidad; el team leader, solo su
 * propia fila. Escribirlos es solo de administradores.
 */
export async function listarTeamLeadersEnlazados(supabase: ClienteServidor): Promise<{ nombre: string; usuario_id: string }[]> {
  const { data } = await supabase.from("calidad_team_leaders").select("nombre, usuario_id").order("nombre");
  return data ?? [];
}

/**
 * Bitácora de auditorías eliminadas: las 500 más recientes, con la foto de
 * lo borrado, quién, cuándo y el motivo.
 *
 * RLS: solo administradores y quien puede eliminar; nadie más recibe filas.
 */
export async function listarAuditoriasEliminadas(supabase: ClienteServidor) {
  const { data } = await supabase.from("calidad_eliminaciones").select("*").order("eliminada_en", { ascending: false }).limit(500);
  return data;
}

/**
 * Lo que un asesor ve de calidad: su fila de la estructura (`yo`, null si
 * la cuenta no está vinculada), sus 50 auditorías publicadas más recientes,
 * los ítems que no cumplió con su hallazgo, el catálogo de ítems, sus
 * retroalimentaciones y los compromisos por fecha límite.
 *
 * Filtro: `usuarioId`. Se filtra además por la fila de la estructura de
 * quien entra, para que quien sí tiene el cuadro no vea aquí a todo el
 * mundo.
 *
 * RLS: no hace falta el cuadro de Calidad; el asesor solo recibe lo suyo
 * publicado.
 */
export async function cargarMisEvaluaciones(supabase: ClienteServidor, usuarioId: string) {
  const { data: yo } = await supabase.from("calidad_asesores").select("id, nombre, team_leader").eq("usuario_id", usuarioId).maybeSingle();
  const { data: evals } = yo
    ? await supabase.from("v_calidad_evaluaciones").select("*").eq("asesor_id", yo.id).eq("estado", "publicada").order("fecha_auditoria", { ascending: false }).limit(50)
    : { data: [] };
  const ids = (evals ?? []).map((e) => e.id);
  const [{ data: fallas }, { data: items }, { data: retros }] = await Promise.all([
    ids.length ? supabase.from("calidad_respuestas").select("evaluacion_id, item_id, hallazgo").eq("resultado", "no_cumple").in("evaluacion_id", ids) : Promise.resolve({ data: [] as { evaluacion_id: string; item_id: string; hallazgo: string | null }[] }),
    supabase.from("calidad_items").select("id, categoria, descripcion, es_fatal"),
    ids.length ? supabase.from("calidad_retroalimentaciones").select("*").in("evaluacion_id", ids) : Promise.resolve({ data: [] as never[] }),
  ]);
  const retroIds = (retros ?? []).map((r) => r.id);
  const { data: compromisos } = retroIds.length ? await supabase.from("calidad_compromisos").select("*").in("retro_id", retroIds).order("fecha_limite") : { data: [] };
  return { yo, evals, fallas, items, retros, compromisos };
}

/**
 * Ranking de asesores del mes en curso (Colombia): posición, promedio,
 * auditorías, aprobadas y críticos, con la fila propia marcada (`es_yo`).
 * Devuelve `{ data, error }` porque la pantalla muestra el error.
 *
 * RLS: ranking_calidad_mes() es security definer y la ve todo el personal
 * con sesión; solo entrega agregados de auditorías publicadas, nunca el
 * detalle.
 */
export async function cargarRankingDelMes(supabase: ClienteServidor) {
  const { data, error } = await supabase.rpc("ranking_calidad_mes");
  return { data, error };
}
