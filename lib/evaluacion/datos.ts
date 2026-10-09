import "server-only";

/*
 * Capa de lectura del módulo de Evaluación de desempeño (lo que en Laravel
 * serían los «modelos»): aquí viven todas las consultas de solo lectura que
 * hacen las páginas de /evaluacion. Las escrituras siguen en
 * app/acciones/evaluacion.ts.
 *
 * Cada función recibe el cliente de Supabase de la sesión
 * (crearClienteServidor), así que la consulta viaja con la identidad de
 * quien navega y es RLS quien decide qué filas vuelven. Aquí no hay chequeos
 * de permisos en TypeScript: el guardia del módulo (exigirModulo) está en el
 * layout y en las páginas.
 *
 * Reglas de lectura (migración 012):
 *  - Catálogo (evaluacion_cargos, evaluacion_criterios, evaluacion_pesos,
 *    evaluacion_360_preguntas): administradores o cualquiera con algún nivel
 *    en el área de Evaluación.
 *  - evaluaciones y evaluacion_360_respuestas: filas de un área en la que la
 *    persona tiene algún nivel.
 *  - evaluacion_calificaciones y evaluacion_observaciones: solo las de
 *    evaluaciones que la persona puede ver.
 *  - Las vistas (v_evaluacion_resultados, v_evaluacion_360) son
 *    security_invoker: heredan las reglas de las tablas que leen.
 */
import type { ClienteServidor } from "@/lib/supabase/server";
import type { EstadoEvaluacion } from "@/lib/supabase/tipos";

// ---------- Catálogo de cargos ----------

/**
 * Cargos activos con código, nombre y área/departamento, por `orden`: las
 * filas del compendio ejecutivo del Dashboard.
 *
 * Acceso: catálogo (administradores o algún nivel en Evaluación).
 */
export async function listarCargosActivosConArea(supabase: ClienteServidor) {
  const { data } = await supabase
    .from("evaluacion_cargos")
    .select("id, codigo, nombre, area_departamento")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

/**
 * Cargos activos (id y nombre), por `orden`: el desplegable de cargo de la
 * matriz 360.
 *
 * Acceso: catálogo (administradores o algún nivel en Evaluación).
 */
export async function listarCargosActivos(supabase: ClienteServidor) {
  const { data } = await supabase.from("evaluacion_cargos").select("id, nombre").eq("activo", true).order("orden");
  return data ?? [];
}

/**
 * Todos los cargos (id y nombre), activos o no, por `orden`: el filtro y la
 * columna «Cargo» del listado de formatos, que también nombra el cargo de
 * evaluaciones hechas con cargos ya desactivados.
 *
 * Acceso: catálogo (administradores o algún nivel en Evaluación).
 */
export async function listarTodosLosCargos(supabase: ClienteServidor) {
  const { data } = await supabase.from("evaluacion_cargos").select("id, nombre").order("orden");
  return data ?? [];
}

/**
 * Cargos activos con lo que necesita el alta de una evaluación (id, nombre,
 * etiqueta del evaluado y campaña por defecto), por `orden`.
 *
 * Acceso: catálogo (administradores o algún nivel en Evaluación).
 */
export async function listarCargosParaNuevaEvaluacion(supabase: ClienteServidor) {
  const { data } = await supabase
    .from("evaluacion_cargos")
    .select("id, nombre, etiqueta_evaluado, campana_defecto")
    .eq("activo", true)
    .order("orden");
  return data ?? [];
}

// ---------- Evaluaciones por cargo ----------

/**
 * Periodos en los que hay alguna evaluación, sin repetir y del más reciente
 * al más antiguo (orden de texto inverso). Lee como mucho 1000 evaluaciones.
 *
 * Acceso: solo cuentan las evaluaciones de áreas en las que la persona tiene
 * algún nivel.
 */
export async function listarPeriodos(supabase: ClienteServidor) {
  const { data } = await supabase.from("evaluaciones").select("periodo").limit(1000);
  return [...new Set((data ?? []).map((f) => f.periodo))].sort().reverse();
}

/**
 * Evaluaciones de un periodo para el Dashboard: id, cargo, periodo y estado.
 * Con `periodo` null no se filtra (la opción «Todos»). Máximo 1000 filas.
 *
 * Acceso: evaluaciones de áreas en las que la persona tiene algún nivel.
 */
export async function listarEvaluacionesDelPeriodo(supabase: ClienteServidor, periodo: string | null) {
  let consulta = supabase.from("evaluaciones").select("id, cargo_id, periodo, estado").limit(1000);
  if (periodo !== null) consulta = consulta.eq("periodo", periodo);
  const { data } = await consulta;
  return data ?? [];
}

/** Filtros del listado de formatos. La cadena vacía significa «sin filtro». */
export type FiltrosEvaluaciones = {
  cargoId: string;
  periodo: string;
  estado: EstadoEvaluacion | "";
};

/**
 * El listado de formatos: una fila por evaluación (cargo, periodo, evaluado,
 * evaluador, fecha, estado y última modificación), de la modificada más
 * recientemente a la más antigua, máximo 300. Filtra por cargo, periodo y
 * estado cuando vienen informados.
 *
 * Devuelve también el `error` de la consulta para que la página lo muestre.
 *
 * Acceso: evaluaciones de áreas en las que la persona tiene algún nivel.
 */
export async function listarEvaluaciones(
  supabase: ClienteServidor,
  { cargoId, periodo, estado }: FiltrosEvaluaciones,
) {
  let consulta = supabase
    .from("evaluaciones")
    .select("id, cargo_id, periodo, evaluado_nombre, evaluador_nombre, fecha_evaluacion, estado, actualizado_en")
    .order("actualizado_en", { ascending: false })
    .limit(300);
  if (cargoId) consulta = consulta.eq("cargo_id", cargoId);
  if (periodo) consulta = consulta.eq("periodo", periodo);
  if (estado) consulta = consulta.eq("estado", estado);
  const { data, error } = await consulta;
  return { evaluaciones: data ?? [], error };
}

/**
 * Resultados completos (vista v_evaluacion_resultados: medias por
 * perspectiva, número de criterios y de calificaciones, nota final) de las
 * evaluaciones indicadas. Sin ids no consulta y devuelve [].
 *
 * Acceso: la vista es security_invoker; solo vuelven los resultados de
 * evaluaciones que la persona puede ver.
 */
export async function listarResultadosDeEvaluaciones(supabase: ClienteServidor, ids: string[]) {
  if (ids.length === 0) return [];
  const { data } = await supabase.from("v_evaluacion_resultados").select("*").in("evaluacion_id", ids);
  return data ?? [];
}

/**
 * Nota final y número de calificaciones (vista v_evaluacion_resultados) de
 * las evaluaciones indicadas: lo que muestra el listado de formatos. Sin ids
 * no consulta y devuelve [].
 *
 * Acceso: la vista es security_invoker; solo vuelven los resultados de
 * evaluaciones que la persona puede ver.
 */
export async function listarNotasDeEvaluaciones(supabase: ClienteServidor, ids: string[]) {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("v_evaluacion_resultados")
    .select("evaluacion_id, nota_final, n_calificaciones")
    .in("evaluacion_id", ids);
  return data ?? [];
}

// ---------- Hoja de una evaluación ----------

/**
 * Una evaluación completa (todas las columnas) por id, o null si no existe o
 * la persona no la puede ver: la página lo convierte en 404.
 *
 * Acceso: evaluaciones de áreas en las que la persona tiene algún nivel.
 */
export async function obtenerEvaluacion(supabase: ClienteServidor, id: string) {
  const { data } = await supabase.from("evaluaciones").select("*").eq("id", id).maybeSingle();
  return data;
}

/**
 * Todo lo que monta la hoja de una evaluación, leído en paralelo:
 *  - `cargo`: la fila completa del cargo, o null si no existe o no es visible;
 *  - `criterios`: los criterios del cargo, por `orden`;
 *  - `calificaciones`: criterio, perspectiva y calificación de la evaluación;
 *  - `observaciones`: criterio y observación de la evaluación;
 *  - `pesos`: las filas de evaluacion_pesos (perspectiva y peso), sin filtro.
 *
 * Acceso: cargo, criterios y pesos son catálogo (administradores o algún
 * nivel en Evaluación); calificaciones y observaciones solo vuelven si la
 * persona puede ver la evaluación.
 */
export async function obtenerContenidoHoja(supabase: ClienteServidor, evaluacionId: string, cargoId: string) {
  const [{ data: cargo }, { data: criterios }, { data: calificaciones }, { data: observaciones }, { data: pesos }] =
    await Promise.all([
      supabase.from("evaluacion_cargos").select("*").eq("id", cargoId).maybeSingle(),
      supabase.from("evaluacion_criterios").select("*").eq("cargo_id", cargoId).order("orden"),
      supabase
        .from("evaluacion_calificaciones")
        .select("criterio_id, perspectiva, calificacion")
        .eq("evaluacion_id", evaluacionId),
      supabase.from("evaluacion_observaciones").select("criterio_id, observacion").eq("evaluacion_id", evaluacionId),
      supabase.from("evaluacion_pesos").select("perspectiva, peso"),
    ]);
  return {
    cargo,
    criterios: criterios ?? [],
    calificaciones: calificaciones ?? [],
    observaciones: observaciones ?? [],
    pesos: pesos ?? [],
  };
}

// ---------- Matriz 360 ----------

/**
 * Las preguntas de la matriz 360 (todas las columnas), por `orden`.
 *
 * Acceso: catálogo (administradores o algún nivel en Evaluación).
 */
export async function listarPreguntas360(supabase: ClienteServidor) {
  const { data } = await supabase.from("evaluacion_360_preguntas").select("*").order("orden");
  return data ?? [];
}

/**
 * El registro de la matriz 360 (vista v_evaluacion_360, todas las columnas:
 * la respuesta, el nombre del cargo, el promedio y las medias por
 * competencia), del consecutivo más alto al más bajo, máximo 300.
 *
 * Devuelve también el `error` de la consulta para que la página lo muestre.
 *
 * Acceso: respuestas de áreas en las que la persona tiene algún nivel (la
 * vista es security_invoker).
 */
export async function listarRespuestas360(supabase: ClienteServidor) {
  const { data, error } = await supabase
    .from("v_evaluacion_360")
    .select("*")
    .order("consecutivo", { ascending: false })
    .limit(300);
  return { respuestas: data ?? [], error };
}

/**
 * Lo que alimenta el Resumen General del Dashboard (vista v_evaluacion_360):
 * perspectiva, promedio y medias por competencia de cada respuesta. Con
 * `anio` se limita a respuestas con fecha dentro de ese año natural (del 1 de
 * enero al 31 de diciembre); con null, todas. Máximo 2000 filas.
 *
 * Acceso: respuestas de áreas en las que la persona tiene algún nivel (la
 * vista es security_invoker).
 */
export async function listarPromedios360(supabase: ClienteServidor, anio: string | null) {
  let consulta = supabase
    .from("v_evaluacion_360")
    .select("perspectiva, promedio, liderazgo, trabajo_equipo, calidad_resultados, adaptabilidad")
    .limit(2000);
  if (anio !== null) consulta = consulta.gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`);
  const { data } = await consulta;
  return data ?? [];
}
