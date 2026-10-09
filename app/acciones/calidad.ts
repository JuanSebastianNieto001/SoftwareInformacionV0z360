"use server";

// Acciones de servidor de Calidad (QualityCore): auditorías y su pauta,
// retroalimentación con compromisos, matriz de ítems y estructura de asesores.
// Aquí solo se escribe; las lecturas de las pantallas viven en
// lib/calidad/datos.ts. Lo delicado (publicar en lote, eliminar una auditoría,
// firmar la retro) pasa por funciones de la base, que validan quién y qué en
// la misma transacción, en lugar de por un update suelto.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { mensajePostgrest } from "@/lib/api/errores";
import { registrarAcceso } from "@/lib/auditoria";
import { exigirSesion } from "@/lib/sesion";
import type { Accion } from "@/lib/supabase/tipos";
import {
  esquemaAsesorCalidad,
  esquemaAuditoria,
  esquemaCompromiso,
  esquemaFirmaRetro,
  esquemaItemCalidad,
  esquemaMatrizCalidad,
  esquemaRespuestasCalidad,
  esquemaRetro,
  primerError,
} from "@/lib/validaciones";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Acciones del módulo de calidad. Como en el resto de la aplicación, nada
 * decide permisos en TypeScript: el cliente de sesión deja que las políticas
 * de las tablas calidad_* acepten o rechacen. Publicar, firmar y borrar
 * dejan rastro en la auditoría porque son hechos sobre el desempeño de una
 * persona.
 */

const esUuid = (v: string) => z.uuid().safeParse(v).success;

async function anotar(accion: Accion, titulo: string, sesion: Awaited<ReturnType<typeof exigirSesion>>) {
  await registrarAcceso(sesion.supabase, sesion.user, {
    accion,
    documento: { id: null, titulo, area_nombre: "Calidad" },
    perfilNombre: sesion.perfil.nombre,
    request: { headers: await headers() },
  });
}

function refrescar(id?: string) {
  revalidatePath("/calidad");
  revalidatePath("/calidad/evaluaciones");
  revalidatePath("/mis-evaluaciones");
  if (id) revalidatePath(`/calidad/evaluaciones/${id}`);
}

// ---------------------------------------------------------------------------
// Auditorías
// ---------------------------------------------------------------------------

export async function crearAuditoria(datos: unknown): Promise<Resultado> {
  const parsed = esquemaAuditoria.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const sesion = await exigirSesion();
  const { supabase, user, perfil } = sesion;

  const { data: areaId } = await supabase.rpc("area_modulo", { m: "calidad" });
  if (!areaId) return { ok: false, error: "El módulo de calidad no está disponible." };

  // El nombre y el team leader se copian al momento de auditar: si la
  // estructura cambia después, la auditoría sigue diciendo lo que era.
  const { data: asesor } = await supabase
    .from("calidad_asesores")
    .select("nombre, team_leader")
    .eq("id", parsed.data.asesor_id)
    .maybeSingle();
  if (!asesor) return { ok: false, error: "El asesor no existe en la estructura." };

  const { data, error } = await supabase
    .from("calidad_evaluaciones")
    .insert({
      ...parsed.data,
      area_id: areaId,
      asesor_nombre: asesor.nombre,
      team_leader: asesor.team_leader,
      analista_id: user.id,
      analista_nombre: perfil.nombre,
      creado_por: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };

  refrescar(data.id);
  return { ok: true, id: data.id };
}

/**
 * Ajusta la fecha de auditoría desde la lista. Solo quien hizo la
 * auditoría (o un administrador): lo exige el disparador calidad_fechas.
 */
export async function cambiarFechaAuditoria(id: string, fecha: string): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) return { ok: false, error: "Fecha inválida" };
  const { supabase } = await exigirSesion();
  const { data, error } = await supabase.from("calidad_evaluaciones").update({ fecha_auditoria: fecha }).eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  if (!data) return { ok: false, error: "No tienes permiso para cambiar esta auditoría." };
  refrescar(id);
  return { ok: true, id };
}

export async function actualizarAuditoria(id: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaAuditoria.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();
  // La matriz y el asesor no se cambian desde aquí (y la base lo impide una
  // vez publicada); se actualiza solo lo que describe la interacción.
  const { matriz_id: _m, asesor_id: _a, ...cabecera } = parsed.data;
  void _m;
  void _a;
  const { error } = await supabase.from("calidad_evaluaciones").update(cabecera).eq("id", id);
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  refrescar(id);
  return { ok: true, id };
}

/** Guarda la pauta completa: upsert de lo respondido, borrado de lo que quedó en blanco. */
export async function guardarRespuestasCalidad(datos: unknown): Promise<Resultado> {
  const parsed = esquemaRespuestasCalidad.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { evaluacion_id, respuestas } = parsed.data;
  const { supabase } = await exigirSesion();

  const conValor = respuestas.filter((r) => r.resultado !== null);
  const enBlanco = respuestas.filter((r) => r.resultado === null).map((r) => r.item_id);

  if (conValor.length) {
    const { error } = await supabase.from("calidad_respuestas").upsert(
      conValor.map((r) => ({
        evaluacion_id,
        item_id: r.item_id,
        resultado: r.resultado!,
        hallazgo: r.resultado === "no_cumple" ? r.hallazgo : null,
      })),
      { onConflict: "evaluacion_id,item_id" },
    );
    if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  }
  if (enBlanco.length) {
    const { error } = await supabase
      .from("calidad_respuestas")
      .delete()
      .eq("evaluacion_id", evaluacion_id)
      .in("item_id", enBlanco);
    if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  }
  refrescar(evaluacion_id);
  return { ok: true, id: evaluacion_id };
}

export async function publicarAuditoria(id: string): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const sesion = await exigirSesion();
  const { data, error } = await sesion.supabase
    .from("calidad_evaluaciones")
    .update({ estado: "publicada" })
    .eq("id", id)
    .eq("estado", "borrador")
    .select("asesor_nombre, fecha_interaccion")
    .maybeSingle();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  if (!data) return { ok: false, error: "No se pudo publicar: ya estaba publicada o no tienes acceso." };
  await anotar("editar", `Publica auditoría · ${data.asesor_nombre} · ${data.fecha_interaccion}`, sesion);
  refrescar(id);
  return { ok: true, id };
}

/**
 * Eliminar exige motivo. Pasa por eliminar_auditoria_calidad(), que
 * comprueba el nivel Total explícito, deja la foto en la bitácora
 * (calidad_eliminaciones) y el rastro en accesos antes de borrar.
 */
export async function eliminarAuditoria(id: string, motivo: string): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const m = motivo.trim();
  if (m.length < 10) return { ok: false, error: "Escribe el motivo de la eliminación (mínimo 10 caracteres)." };
  const { supabase } = await exigirSesion();
  const { error } = await supabase.rpc("eliminar_auditoria_calidad", { p_id: id, p_motivo: m.slice(0, 1000) });
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  refrescar();
  revalidatePath("/calidad/eliminadas");
  return { ok: true };
}

export type ResultadoLote = { ok: true; publicadas: number; fallidas: { asesor: string; motivo: string }[] } | { ok: false; error: string };

/**
 * Publica borradores de un tirón: sin ids, todos los borradores de quien
 * llama; con ids, esos. La base valida cada una (pauta completa, pesos) y
 * devuelve cuáles quedaron y por qué no las demás.
 */
export async function publicarBorradores(ids?: string[]): Promise<ResultadoLote> {
  if (ids && !ids.every(esUuid)) return { ok: false, error: "Identificador inválido" };
  const sesion = await exigirSesion();
  const { data, error } = await sesion.supabase.rpc("publicar_borradores_calidad", { p_ids: ids && ids.length ? ids : null });
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  const filas = data ?? [];
  const publicadas = filas.filter((f) => f.publicada);
  if (publicadas.length) await anotar("editar", `Publica ${publicadas.length} auditorías en lote`, sesion);
  refrescar();
  return {
    ok: true,
    publicadas: publicadas.length,
    fallidas: filas.filter((f) => !f.publicada).map((f) => ({ asesor: f.asesor_nombre, motivo: f.motivo ?? "No se pudo publicar" })),
  };
}

// ---------------------------------------------------------------------------
// Retroalimentación y compromisos
// ---------------------------------------------------------------------------

export async function abrirRetroalimentacion(evaluacionId: string): Promise<Resultado> {
  if (!esUuid(evaluacionId)) return { ok: false, error: "Identificador inválido" };
  const { supabase, user, perfil } = await exigirSesion();
  const { data: areaId } = await supabase.rpc("area_modulo", { m: "calidad" });
  if (!areaId) return { ok: false, error: "El módulo de calidad no está disponible." };
  const { data, error } = await supabase
    .from("calidad_retroalimentaciones")
    .insert({
      evaluacion_id: evaluacionId,
      area_id: areaId,
      realizada_por: user.id,
      realizada_por_nombre: perfil.nombre,
      estado: "en_proceso",
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  refrescar(evaluacionId);
  return { ok: true, id: data.id };
}

export async function actualizarRetroalimentacion(id: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaRetro.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();
  const { data, error } = await supabase
    .from("calidad_retroalimentaciones")
    .update(parsed.data)
    .eq("id", id)
    .select("evaluacion_id")
    .maybeSingle();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  if (!data) return { ok: false, error: "No se pudo guardar: está firmada o no tienes acceso." };
  refrescar(data.evaluacion_id);
  return { ok: true, id };
}

export async function crearCompromiso(retroId: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(retroId)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaCompromiso.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();
  const { data, error } = await supabase
    .from("calidad_compromisos")
    .insert({ ...parsed.data, retro_id: retroId })
    .select("id")
    .single();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  refrescar();
  return { ok: true, id: data.id };
}

export async function actualizarCompromiso(id: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaCompromiso.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();
  const cerrado = parsed.data.estado === "cumplido" || parsed.data.estado === "no_cumplido";
  const { error } = await supabase
    .from("calidad_compromisos")
    .update({ ...parsed.data, cerrado_en: cerrado ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  refrescar();
  return { ok: true, id };
}

export async function eliminarCompromiso(id: string): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const { supabase } = await exigirSesion();
  const { error } = await supabase.from("calidad_compromisos").delete().eq("id", id);
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  refrescar();
  return { ok: true };
}

/** La firma del asesor. La función de la base comprueba que firma el evaluado y que hay compromisos. */
export async function firmarRetroalimentacion(datos: unknown): Promise<Resultado> {
  const parsed = esquemaFirmaRetro.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();
  const { error } = await supabase.rpc("firmar_retroalimentacion", {
    p_retro: parsed.data.retro_id,
    p_comentarios: parsed.data.comentarios,
  });
  if (error) return { ok: false, error: error.message.replace(/^.*?: /, "") };
  refrescar();
  revalidatePath("/", "layout");
  return { ok: true, id: parsed.data.retro_id };
}

// ---------------------------------------------------------------------------
// Matriz e ítems
// ---------------------------------------------------------------------------

export async function actualizarMatriz(id: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaMatrizCalidad.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();
  const { error } = await supabase.from("calidad_matrices").update(parsed.data).eq("id", id);
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  revalidatePath("/calidad/matriz");
  return { ok: true, id };
}

export async function crearItem(matrizId: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(matrizId)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaItemCalidad.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();
  const { data, error } = await supabase
    .from("calidad_items")
    .insert({ ...parsed.data, matriz_id: matrizId })
    .select("id")
    .single();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  revalidatePath("/calidad/matriz");
  return { ok: true, id: data.id };
}

export async function actualizarItem(id: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaItemCalidad.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();
  const { error } = await supabase.from("calidad_items").update(parsed.data).eq("id", id);
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  revalidatePath("/calidad/matriz");
  return { ok: true, id };
}

/**
 * Un ítem con respuestas no se borra (la clave foránea lo impide): se
 * desactiva, y deja de pedirse en las auditorías nuevas sin perder las
 * viejas.
 */
export async function desactivarItem(id: string): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const { supabase } = await exigirSesion();
  const { error } = await supabase.from("calidad_items").update({ activo: false }).eq("id", id);
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  revalidatePath("/calidad/matriz");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Estructura operativa
// ---------------------------------------------------------------------------

export async function crearAsesor(datos: unknown): Promise<Resultado> {
  const parsed = esquemaAsesorCalidad.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();
  const { data: areaId } = await supabase.rpc("area_modulo", { m: "calidad" });
  if (!areaId) return { ok: false, error: "El módulo de calidad no está disponible." };
  const { data, error } = await supabase
    .from("calidad_asesores")
    .insert({ ...parsed.data, area_id: areaId })
    .select("id")
    .single();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  revalidatePath("/calidad/asesores");
  return { ok: true, id: data.id };
}

export async function actualizarAsesor(id: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaAsesorCalidad.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();
  const { error } = await supabase.from("calidad_asesores").update(parsed.data).eq("id", id);
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  revalidatePath("/calidad/asesores");
  return { ok: true, id };
}

/**
 * Activar o desactivar en un clic, para depurar rápido a quien ya no está
 * en la operación. Las auditorías históricas no se tocan; la persona solo
 * deja de aparecer al crear auditorías o feedback nuevos.
 */
export async function alternarActivoAsesor(id: string, activo: boolean): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const { supabase } = await exigirSesion();
  const { data, error } = await supabase.from("calidad_asesores").update({ activo }).eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  if (!data) return { ok: false, error: "No tienes permiso para modificar la estructura." };
  revalidatePath("/calidad/asesores");
  return { ok: true, id };
}
