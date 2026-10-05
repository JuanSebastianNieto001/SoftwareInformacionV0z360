import "server-only";

import type { NotificacionShell } from "@/components/comunes/campana-notificaciones";
import type { ClienteServidor } from "./supabase/server";

/**
 * Lo que la campana de la cabecera necesita: las notificaciones sin leer
 * de quien navega. Antes de leerlas se generan las que falten (hoy solo
 * cumpleaños); la función es idempotente y no crea nada para quien no
 * tiene acceso al cuadro, así que llamarla en cada petición es barato.
 */
export async function cargarNotificaciones(supabase: ClienteServidor): Promise<NotificacionShell[]> {
  await supabase.rpc("generar_alertas_cumpleanos");
  const { data } = await supabase
    .from("notificaciones")
    .select("id, titulo, cuerpo, enlace, creado_en")
    .is("leida_en", null)
    .order("creado_en", { ascending: false })
    .limit(20);
  return data ?? [];
}
