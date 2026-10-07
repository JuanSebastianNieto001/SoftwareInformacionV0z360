"use server";

// Acciones del módulo PDA: el plan del mes, sus indicadores y las mediciones.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensajePostgrest } from "@/lib/api-errores";
import { exigirSesion } from "@/lib/sesion";
import {
  esquemaIndicadorPda,
  esquemaMedicionPda,
  esquemaPlanPda,
  primerError,
} from "@/lib/validaciones";
import type { PostgrestError } from "@supabase/supabase-js";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

const esUuid = (v: string) => z.uuid().safeParse(v).success;

/**
 * Nada comprueba permisos en TypeScript: el cliente de sesión deja que las
 * políticas de pda_* acepten o rechacen (Edición para crear y medir, Total
 * o admin para borrar un PDA o un indicador). Un update que RLS no deja
 * ver devuelve cero filas en lugar de error, así que se pide la fila de
 * vuelta y su ausencia se explica como falta de permiso.
 */

const SIN_PERMISO = "No tienes permiso para modificar el PDA.";

function traducir(error: PostgrestError): string {
  if (error.message.includes("está cerrado")) return "El PDA está cerrado. Reábrelo para modificarlo.";
  if (error.code === "23505") return "Ya existe un PDA para ese mes.";
  return mensajePostgrest(error).mensaje;
}

function refrescar(planId?: string) {
  revalidatePath("/pda");
  if (planId) revalidatePath(`/pda/${planId}`);
}

// ---------- Plan del mes ----------

export async function crearPlan(datos: unknown): Promise<Resultado> {
  const parsed = esquemaPlanPda.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase, user } = await exigirSesion();

  const { data: areaId } = await supabase.rpc("area_modulo", { m: "pda" });
  if (!areaId) return { ok: false, error: "El módulo PDA no está disponible." };

  const { data, error } = await supabase
    .from("pda_planes")
    .insert({ ...parsed.data, area_id: areaId, creado_por: user.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: traducir(error) };

  refrescar(data.id);
  return { ok: true, id: data.id };
}

export async function actualizarPlan(id: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaPlanPda.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase
    .from("pda_planes")
    .update(parsed.data)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: SIN_PERMISO };

  refrescar(id);
  return { ok: true, id };
}

/** Cerrar congela el PDA (la base rechaza cambios en indicadores y mediciones); reabrir lo descongela. */
export async function cambiarEstadoPlan(id: string, cerrar: boolean): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase
    .from("pda_planes")
    .update({ estado: cerrar ? "cerrado" : "abierto" })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: SIN_PERMISO };

  refrescar(id);
  return { ok: true, id };
}

export async function eliminarPlan(id: string): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase.from("pda_planes").delete().eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: "No se pudo eliminar: no existe o no tienes nivel Total." };

  refrescar();
  return { ok: true };
}

// ---------- Indicadores ----------

export async function crearIndicador(planId: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(planId)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaIndicadorPda.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase, user } = await exigirSesion();

  const { data: areaId } = await supabase.rpc("area_modulo", { m: "pda" });
  if (!areaId) return { ok: false, error: "El módulo PDA no está disponible." };

  // area_id lo impone la base a partir del plan; se envía para cumplir el esquema.
  const { data, error } = await supabase
    .from("pda_indicadores")
    .insert({ ...parsed.data, plan_id: planId, area_id: areaId, creado_por: user.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: traducir(error) };

  refrescar(planId);
  return { ok: true, id: data.id };
}

export async function actualizarIndicador(id: string, planId: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(id) || !esUuid(planId)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaIndicadorPda.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase
    .from("pda_indicadores")
    .update(parsed.data)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: SIN_PERMISO };

  refrescar(planId);
  return { ok: true, id };
}

export async function eliminarIndicador(id: string, planId: string): Promise<Resultado> {
  if (!esUuid(id) || !esUuid(planId)) return { ok: false, error: "Identificador inválido" };
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase.from("pda_indicadores").delete().eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: "No se pudo eliminar: no existe o no tienes nivel Total." };

  refrescar(planId);
  return { ok: true };
}

// ---------- Mediciones ----------

export async function registrarMedicion(planId: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(planId)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaMedicionPda.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase, user } = await exigirSesion();

  const { data: areaId } = await supabase.rpc("area_modulo", { m: "pda" });
  if (!areaId) return { ok: false, error: "El módulo PDA no está disponible." };

  const { data, error } = await supabase
    .from("pda_mediciones")
    .insert({ ...parsed.data, area_id: areaId, registrado_por: user.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: traducir(error) };

  refrescar(planId);
  return { ok: true, id: data.id };
}

/** Borrar una medición equivocada es corregir: basta con Edición. */
export async function eliminarMedicion(id: string, planId: string): Promise<Resultado> {
  if (!esUuid(id) || !esUuid(planId)) return { ok: false, error: "Identificador inválido" };
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase.from("pda_mediciones").delete().eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: SIN_PERMISO };

  refrescar(planId);
  return { ok: true };
}
