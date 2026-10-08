import "server-only";

import { after } from "next/server";
import type { NotificacionShell } from "@/components/comunes/campana-notificaciones";
import type { ClienteServidor } from "./supabase/server";

/**
 * Lo que la campana de la cabecera necesita: las notificaciones sin leer
 * de quien navega.
 *
 * Generar las que falten (cumpleaños, calidad, feedback) se hace con
 * `after()`, DESPUÉS de responder la página: son tres funciones de base de
 * datos y tenerlas en el camino crítico hacía lenta cada navegación (el
 * clic a una pestaña parecía no responder). Son idempotentes, así que lo
 * generado en esta visita se ve en la siguiente carga, segundos después.
 */
export async function cargarNotificaciones(supabase: ClienteServidor): Promise<NotificacionShell[]> {
  after(async () => {
    await Promise.allSettled([
      supabase.rpc("generar_alertas_cumpleanos"),
      supabase.rpc("generar_alertas_calidad"),
      supabase.rpc("generar_alertas_feedback"),
    ]);
  });

  const { data } = await supabase
    .from("notificaciones")
    .select("id, titulo, cuerpo, enlace, creado_en")
    .is("leida_en", null)
    .order("creado_en", { ascending: false })
    .limit(20);
  return data ?? [];
}
