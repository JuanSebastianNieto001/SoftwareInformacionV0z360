"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensajePostgrest } from "@/lib/api-errores";
import { exigirSesion } from "@/lib/sesion";

export type Resultado = { ok: true } | { ok: false; error: string };

/**
 * Notificaciones de la campana. Solo hay dos cosas que una persona puede
 * hacer con las suyas: marcar una como leída, o todas. Crearlas no es
 * cosa de nadie: las generan funciones de la base (hoy, los cumpleaños).
 *
 * RLS limita las dos operaciones a las filas propias, y un privilegio de
 * columna (migración 015) hace que `leida_en` sea lo único modificable.
 */

export async function marcarNotificacionLeida(id: string): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identificador inválido" };
  const { supabase } = await exigirSesion();
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
