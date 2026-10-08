import "server-only";

import type { NotificacionShell } from "@/components/comunes/campana-notificaciones";
import type { ClienteServidor } from "./supabase/server";

/**
 * Lo que la campana de la cabecera necesita: las notificaciones sin leer
 * de quien navega. Antes de leerlas se generan las que falten (cumpleaños
 * y calidad); las funciones son idempotentes y no crean nada para quien no
 * tiene acceso o no es el destinatario, así que llamarlas en cada petición
 * es barato.
 */
export async function cargarNotificaciones(supabase: ClienteServidor): Promise<NotificacionShell[]> {
  await Promise.all([supabase.rpc("generar_alertas_cumpleanos"), supabase.rpc("generar_alertas_calidad"), supabase.rpc("generar_alertas_feedback")]);
  const { data } = await supabase
    .from("notificaciones")
    .select("id, titulo, cuerpo, enlace, creado_en")
    .is("leida_en", null)
    .order("creado_en", { ascending: false })
    .limit(20);
  return data ?? [];
}
