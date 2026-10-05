"use server";

// Acciones del módulo de evaluación de desempeño (formatos por cargo y matriz
// 360).
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { mensajePostgrest } from "@/lib/api-errores";
import { registrarAcceso } from "@/lib/auditoria";
import { exigirSesion } from "@/lib/sesion";
import type { Accion } from "@/lib/supabase/tipos";
import {
  esquemaCalificaciones,
  esquemaEvaluacionCabecera,
  esquemaEvaluacionNueva,
  esquemaRespuesta360,
  primerError,
} from "@/lib/validaciones";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Acciones del módulo de evaluación de desempeño.
 *
 * Ninguna comprueba permisos en TypeScript: todas usan el cliente de sesión
 * y dejan que las políticas de evaluaciones / evaluacion_calificaciones /
 * evaluacion_360_respuestas acepten o rechacen. Aquí se valida la forma de
 * los datos y se deja rastro en la auditoría, porque una evaluación de
 * desempeño es información de personas y conviene saber quién la tocó.
 */

const esUuid = (v: string) => z.uuid().safeParse(v).success;

async function anotar(
  accion: Accion,
  titulo: string,
  sesion: Awaited<ReturnType<typeof exigirSesion>>,
): Promise<void> {
  await registrarAcceso(sesion.supabase, sesion.user, {
    accion,
    documento: { id: null, titulo, area_nombre: "Evaluación de desempeño" },
    perfilNombre: sesion.perfil.nombre,
    request: { headers: await headers() },
  });
}

function refrescar(id?: string) {
  revalidatePath("/evaluacion");
  revalidatePath("/evaluacion/formatos");
  revalidatePath("/evaluacion/360");
  if (id) revalidatePath(`/evaluacion/formatos/${id}`);
}

// ---------------------------------------------------------------------------
// Formato por cargo
// ---------------------------------------------------------------------------

export async function crearEvaluacion(datos: unknown): Promise<Resultado> {
  const parsed = esquemaEvaluacionNueva.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };

  const sesion = await exigirSesion();
  const { supabase, user } = sesion;

  // El área del módulo la resuelve la base; la política de insert exige
  // que coincida, así que no se puede colar una evaluación en otro cuadro.
  const { data: areaId } = await supabase.rpc("area_evaluacion");
  if (!areaId) return { ok: false, error: "El módulo de evaluación no está disponible." };

  const { data, error } = await supabase
    .from("evaluaciones")
    .insert({ ...parsed.data, area_id: areaId, creado_por: user.id, actualizado_por: user.id })
    .select("id, cargo_id")
    .single();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };

  await anotar(
    "subir",
    `Evaluación · ${parsed.data.evaluado_nombre} · ${parsed.data.periodo}`,
    sesion,
  );
  refrescar(data.id);
  return { ok: true, id: data.id };
}

export async function actualizarCabeceraEvaluacion(id: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaEvaluacionCabecera.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };

  const sesion = await exigirSesion();
  const { error } = await sesion.supabase
    .from("evaluaciones")
    .update({ ...parsed.data, actualizado_por: sesion.user.id })
    .eq("id", id);
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };

  refrescar(id);
  return { ok: true, id };
}

/**
 * Guarda la hoja completa: todas las celdas de calificación y las
 * observaciones de una vez. Una calificación null borra la celda, como
 * dejar en blanco una casilla de la hoja de cálculo.
 */
export async function guardarCalificaciones(datos: unknown): Promise<Resultado> {
  const parsed = esquemaCalificaciones.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { evaluacion_id, calificaciones, observaciones } = parsed.data;

  const sesion = await exigirSesion();
  const { supabase, user } = sesion;

  // RLS ya impide escribir en una cerrada; esto solo da un mensaje claro.
  const { data: ev } = await supabase
    .from("evaluaciones")
    .select("id, estado, evaluado_nombre, periodo")
    .eq("id", evaluacion_id)
    .maybeSingle();
  if (!ev) return { ok: false, error: "La evaluación no existe o no tienes acceso." };
  if (ev.estado === "cerrada" && sesion.perfil.rol !== "admin") {
    return { ok: false, error: "La evaluación está cerrada. Solo un administrador puede reabrirla." };
  }

  const conValor = calificaciones.filter((c) => c.calificacion !== null);
  const enBlanco = calificaciones.filter((c) => c.calificacion === null);

  if (conValor.length) {
    const { error } = await supabase.from("evaluacion_calificaciones").upsert(
      conValor.map((c) => ({
        evaluacion_id,
        criterio_id: c.criterio_id,
        perspectiva: c.perspectiva,
        calificacion: c.calificacion as number,
      })),
      { onConflict: "evaluacion_id,criterio_id,perspectiva" },
    );
    if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  }

  // Los blancos se borran agrupados por perspectiva: cuatro consultas como
  // máximo en lugar de una por celda.
  for (const perspectiva of new Set(enBlanco.map((c) => c.perspectiva))) {
    const ids = enBlanco.filter((c) => c.perspectiva === perspectiva).map((c) => c.criterio_id);
    const { error } = await supabase
      .from("evaluacion_calificaciones")
      .delete()
      .eq("evaluacion_id", evaluacion_id)
      .eq("perspectiva", perspectiva)
      .in("criterio_id", ids);
    if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  }

  const obsConTexto = observaciones.filter((o) => o.observacion !== null);
  const obsVacias = observaciones.filter((o) => o.observacion === null);
  if (obsConTexto.length) {
    const { error } = await supabase.from("evaluacion_observaciones").upsert(
      obsConTexto.map((o) => ({
        evaluacion_id,
        criterio_id: o.criterio_id,
        observacion: o.observacion as string,
      })),
      { onConflict: "evaluacion_id,criterio_id" },
    );
    if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  }
  if (obsVacias.length) {
    const { error } = await supabase
      .from("evaluacion_observaciones")
      .delete()
      .eq("evaluacion_id", evaluacion_id)
      .in(
        "criterio_id",
        obsVacias.map((o) => o.criterio_id),
      );
    if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  }

  // Deja constancia de quién guardó por última vez (el disparador pone la hora).
  await supabase.from("evaluaciones").update({ actualizado_por: user.id }).eq("id", evaluacion_id);

  await anotar("editar", `Evaluación · ${ev.evaluado_nombre} · ${ev.periodo}`, sesion);
  refrescar(evaluacion_id);
  return { ok: true, id: evaluacion_id };
}

export async function cerrarEvaluacion(id: string): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const sesion = await exigirSesion();
  const { supabase, user } = sesion;

  // Cerrar sin una sola calificación sería firmar una hoja en blanco.
  const { count } = await supabase
    .from("evaluacion_calificaciones")
    .select("criterio_id", { count: "exact", head: true })
    .eq("evaluacion_id", id);
  if (!count) return { ok: false, error: "No se puede cerrar una evaluación sin calificaciones." };

  const { data, error } = await supabase
    .from("evaluaciones")
    .update({ estado: "cerrada", cerrada_en: new Date().toISOString(), actualizado_por: user.id })
    .eq("id", id)
    .eq("estado", "borrador")
    .select("evaluado_nombre, periodo")
    .maybeSingle();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  if (!data) return { ok: false, error: "La evaluación ya estaba cerrada o no tienes acceso." };

  await anotar("editar", `Cierre · ${data.evaluado_nombre} · ${data.periodo}`, sesion);
  refrescar(id);
  return { ok: true, id };
}

/** Solo el administrador: la política de update exige soy_admin() sobre una cerrada. */
export async function reabrirEvaluacion(id: string): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const sesion = await exigirSesion();
  const { data, error } = await sesion.supabase
    .from("evaluaciones")
    .update({ estado: "borrador", cerrada_en: null, actualizado_por: sesion.user.id })
    .eq("id", id)
    .eq("estado", "cerrada")
    .select("evaluado_nombre, periodo")
    .maybeSingle();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  if (!data) return { ok: false, error: "No se pudo reabrir: no está cerrada o no tienes permiso." };

  await anotar("editar", `Reapertura · ${data.evaluado_nombre} · ${data.periodo}`, sesion);
  refrescar(id);
  return { ok: true, id };
}

export async function eliminarEvaluacion(id: string): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const sesion = await exigirSesion();
  const { data, error } = await sesion.supabase
    .from("evaluaciones")
    .delete()
    .eq("id", id)
    .select("evaluado_nombre, periodo")
    .maybeSingle();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  if (!data) return { ok: false, error: "No se pudo eliminar: no existe o no tienes nivel Total." };

  await anotar("eliminar", `Evaluación · ${data.evaluado_nombre} · ${data.periodo}`, sesion);
  refrescar();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Matriz 360
// ---------------------------------------------------------------------------

export async function crearRespuesta360(datos: unknown): Promise<Resultado> {
  const parsed = esquemaRespuesta360.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { respuestas, ...resto } = parsed.data;

  const sesion = await exigirSesion();
  const { supabase, user } = sesion;

  const { data: areaId } = await supabase.rpc("area_evaluacion");
  if (!areaId) return { ok: false, error: "El módulo de evaluación no está disponible." };

  const [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12] = respuestas;
  const { data, error } = await supabase
    .from("evaluacion_360_respuestas")
    .insert({
      ...resto,
      area_id: areaId,
      creado_por: user.id,
      p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12,
    })
    .select("id, consecutivo")
    .single();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };

  await anotar("subir", `Matriz 360 · EVAL-${String(data.consecutivo).padStart(3, "0")} · ${resto.evaluado_nombre}`, sesion);
  refrescar();
  return { ok: true, id: data.id };
}

export async function eliminarRespuesta360(id: string): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const sesion = await exigirSesion();
  const { data, error } = await sesion.supabase
    .from("evaluacion_360_respuestas")
    .delete()
    .eq("id", id)
    .select("consecutivo, evaluado_nombre")
    .maybeSingle();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  if (!data) return { ok: false, error: "No se pudo eliminar: no existe o no tienes nivel Total." };

  await anotar("eliminar", `Matriz 360 · EVAL-${String(data.consecutivo).padStart(3, "0")} · ${data.evaluado_nombre}`, sesion);
  refrescar();
  return { ok: true };
}
