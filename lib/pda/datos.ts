import "server-only";

/**
 * Capa de lectura del PDA (plan de trabajo de TI): las consultas a Supabase
 * que usan las páginas de /pda y las rutas de /api/pda.
 *
 * Cada función recibe el cliente de la sesión (`crearClienteServidor`), así
 * que RLS decide qué filas vuelven: quien no tiene el cuadro recibe listas
 * vacías o `null`. Aquí no hay chequeos de permisos en TypeScript; el guardia
 * (`exigirModulo("pda")`) va en la página o la ruta. Las escrituras siguen en
 * `app/acciones/pda.ts`.
 */
import type { PostgrestError } from "@supabase/supabase-js";
import type { ClienteServidor } from "@/lib/supabase/server";
import type { EvidenciaPda, ObjetivoPda, PlanPda, TareaPda } from "@/lib/supabase/tipos";

/** Un PDA con todo lo que muestra su página. */
export type PlanCompleto = {
  plan: PlanPda;
  /** Objetivos del plan, por `orden` y luego `creado_en`. */
  objetivos: ObjetivoPda[];
  /** Lista de chequeo de esos objetivos, por `orden` y luego `creado_en`. */
  tareas: TareaPda[];
  /** Evidencias de esos objetivos, por `creado_en`. */
  evidencias: EvidenciaPda[];
  /** id de perfil → nombre, de quien marcó una tarea o subió una evidencia. */
  nombres: Record<string, string>;
};

/** Un PDA con lo que lleva su Excel. */
export type PlanParaExcel = {
  plan: PlanPda;
  /** Objetivos del plan, por `orden` y luego `creado_en`. */
  objetivos: ObjetivoPda[];
  /** Todas las tareas del área del plan (la ruta filtra las del plan), por `orden` y luego `creado_en`. */
  tareas: TareaPda[];
  /** Todas las evidencias del área del plan (la ruta filtra las del plan), por `creado_en`. */
  evidencias: EvidenciaPda[];
};

/**
 * Los PDA de todos los meses (`v_pda_planes`, con sus conteos y
 * cumplimiento), del más reciente al más antiguo y por cargo dentro de cada
 * mes; como máximo 240. Devuelve también el error de la consulta para que la
 * página lo muestre. RLS deja ver solo los del cuadro de quien navega.
 */
export async function listarPlanes(supabase: ClienteServidor): Promise<{ planes: PlanPda[]; error: PostgrestError | null }> {
  const { data, error } = await supabase.from("v_pda_planes").select("*").order("periodo", { ascending: false }).order("cargo").limit(240);
  return { planes: data ?? [], error };
}

/**
 * Un PDA por su id (`v_pda_planes`), o `null` si no existe o RLS no lo deja
 * ver a quien lo pide.
 */
async function obtenerPlan(supabase: ClienteServidor, id: string): Promise<PlanPda | null> {
  const { data } = await supabase.from("v_pda_planes").select("*").eq("id", id).maybeSingle();
  return data;
}

/**
 * Los objetivos de un PDA (`v_pda_objetivos`, con sus conteos de tareas y
 * evidencias), por `orden` y luego `creado_en`. RLS decide si vuelven.
 */
async function listarObjetivosDelPlan(supabase: ClienteServidor, planId: string): Promise<ObjetivoPda[]> {
  const { data } = await supabase.from("v_pda_objetivos").select("*").eq("plan_id", planId).order("orden").order("creado_en");
  return data ?? [];
}

/**
 * Nombres de los perfiles indicados (`perfiles`: id y nombre), como mapa
 * id → nombre. Sin ids no consulta. RLS decide qué perfiles vuelven.
 */
async function nombresDePerfiles(supabase: ClienteServidor, ids: Set<string>): Promise<Record<string, string>> {
  const nombres: Record<string, string> = {};
  if (ids.size) {
    const { data: perfiles } = await supabase.from("perfiles").select("id, nombre").in("id", [...ids]);
    for (const p of perfiles ?? []) nombres[p.id] = p.nombre;
  }
  return nombres;
}

/**
 * Todo lo que muestra la página de un PDA: el plan, sus objetivos, la lista
 * de chequeo (`pda_tareas`) y las evidencias (`pda_evidencias`) de esos
 * objetivos, y los nombres de quien marcó o subió cada una. Si el plan no
 * tiene objetivos no consulta tareas ni evidencias. Devuelve `null` si el PDA
 * no existe o RLS no lo deja ver; RLS filtra también todo lo demás.
 */
export async function cargarPlanCompleto(supabase: ClienteServidor, id: string): Promise<PlanCompleto | null> {
  const plan = await obtenerPlan(supabase, id);
  if (!plan) return null;

  const objetivos = await listarObjetivosDelPlan(supabase, id);
  const ids = objetivos.map((o) => o.id);
  const [{ data: tareas }, { data: evidencias }] = ids.length
    ? await Promise.all([
        supabase.from("pda_tareas").select("*").in("objetivo_id", ids).order("orden").order("creado_en"),
        supabase.from("pda_evidencias").select("*").in("objetivo_id", ids).order("creado_en"),
      ])
    : [{ data: [] as TareaPda[] }, { data: [] as EvidenciaPda[] }];

  // Nombres de quien marcó o subió, para no mostrar identificadores.
  const personas = new Set<string>();
  for (const t of tareas ?? []) if (t.completada_por) personas.add(t.completada_por);
  for (const e of evidencias ?? []) if (e.subido_por) personas.add(e.subido_por);
  const nombres = await nombresDePerfiles(supabase, personas);

  return { plan, objetivos, tareas: tareas ?? [], evidencias: evidencias ?? [], nombres };
}

/**
 * Lo que lleva el Excel de un PDA: el plan, sus objetivos y, en paralelo con
 * estos, TODAS las tareas y evidencias del área del plan (filtradas por
 * `area_id`; la ruta se queda con las de los objetivos del plan). Devuelve
 * `null` si el PDA no existe o RLS no lo deja ver; RLS filtra también lo demás.
 */
export async function cargarPlanParaExcel(supabase: ClienteServidor, id: string): Promise<PlanParaExcel | null> {
  const plan = await obtenerPlan(supabase, id);
  if (!plan) return null;

  const [objetivos, { data: tareas }, { data: evidencias }] = await Promise.all([
    listarObjetivosDelPlan(supabase, id),
    supabase.from("pda_tareas").select("*").eq("area_id", plan.area_id).order("orden").order("creado_en"),
    supabase.from("pda_evidencias").select("*").eq("area_id", plan.area_id).order("creado_en"),
  ]);
  return { plan, objetivos, tareas: tareas ?? [], evidencias: evidencias ?? [] };
}

/**
 * Lo necesario para abrir una evidencia (`pda_evidencias`: ruta en Storage,
 * nombre del archivo y objetivo), o `null` si no existe o RLS no la deja ver
 * (solo la ve quien tiene el cuadro).
 */
export async function obtenerEvidencia(
  supabase: ClienteServidor,
  id: string,
): Promise<Pick<EvidenciaPda, "storage_path" | "nombre_archivo" | "objetivo_id"> | null> {
  const { data } = await supabase.from("pda_evidencias").select("storage_path, nombre_archivo, objetivo_id").eq("id", id).maybeSingle();
  return data;
}
