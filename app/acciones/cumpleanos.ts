"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensajePostgrest } from "@/lib/api-errores";
import { GRUPO_ESTRUCTURA } from "@/lib/cumpleanos";
import { exigirSesion } from "@/lib/sesion";
import { esquemaCumple, primerError } from "@/lib/validaciones";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

const esUuid = (v: string) => z.uuid().safeParse(v).success;

/**
 * Cumpleaños y notificaciones. Como en el resto de la aplicación, nada
 * comprueba permisos en TypeScript: el cliente de sesión deja que las
 * políticas de `cumpleanos` y `notificaciones` acepten o rechacen.
 */

export async function crearCumple(datos: unknown): Promise<Resultado> {
  const parsed = esquemaCumple.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase, user } = await exigirSesion();

  const { data: areaId } = await supabase.rpc("area_modulo", { m: "cumpleanos" });
  if (!areaId) return { ok: false, error: "El módulo de cumpleaños no está disponible." };

  const d = parsed.data;
  const { data, error } = await supabase
    .from("cumpleanos")
    .insert({
      ...d,
      area_id: areaId,
      grupo: d.team_leader ?? GRUPO_ESTRUCTURA,
      creado_por: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };

  revalidatePath("/cumpleanos");
  return { ok: true, id: data.id };
}

export async function actualizarCumple(id: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaCumple.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();

  const d = parsed.data;
  const { error } = await supabase
    .from("cumpleanos")
    .update({ ...d, grupo: d.team_leader ?? GRUPO_ESTRUCTURA })
    .eq("id", id);
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };

  revalidatePath("/cumpleanos");
  return { ok: true, id };
}

export async function eliminarCumple(id: string): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const { supabase } = await exigirSesion();
  const { data, error } = await supabase.from("cumpleanos").delete().eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  if (!data) return { ok: false, error: "No se pudo eliminar: no existe o no tienes nivel Total." };

  revalidatePath("/cumpleanos");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Notificaciones
// ---------------------------------------------------------------------------

export async function marcarNotificacionLeida(id: string): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const { supabase } = await exigirSesion();
  // RLS limita a las propias: marcar la de otro no afecta ninguna fila.
  const { error } = await supabase
    .from("notificaciones")
    .update({ leida_en: new Date().toISOString() })
    .eq("id", id)
    .is("leida_en", null);
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function marcarTodasLeidas(): Promise<Resultado> {
  const { supabase, user } = await exigirSesion();
  const { error } = await supabase
    .from("notificaciones")
    .update({ leida_en: new Date().toISOString() })
    .eq("usuario_id", user.id)
    .is("leida_en", null);
  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  revalidatePath("/", "layout");
  return { ok: true };
}
