import "server-only";

/**
 * Capa de lectura del buzón de sugerencias (PQR): lo que ve quien reporta y
 * la bandeja de quien lo gestiona. Las etiquetas, el radicado y la evidencia
 * siguen en lib/buzon/index.ts; aquí solo hay consultas.
 *
 * Reglas de esta capa:
 *  - Solo lecturas. Crear, tratar, cerrar y exportar casos vive en las rutas
 *    de app/api/buzon.
 *  - Cada función recibe el cliente de la sesión (crearClienteServidor) y
 *    RLS decide qué filas vuelven: cada quien ve sus propios registros y
 *    quien gestiona el buzón (gestiono_buzon()) los ve todos. Aquí no hay
 *    chequeos de permisos en TypeScript.
 *  - Ninguna función usa el cliente de servicio (service_role).
 *  - Las listas devuelven `data ?? []`.
 */
import type { ClienteServidor } from "@/lib/supabase/server";

/**
 * Los últimos 50 registros enviados por una persona (radicado, tipo,
 * proceso, estado, fecha y respuesta al emisor), del más reciente al más
 * antiguo. El filtro por emisor es explícito y no delegado a RLS: quien
 * gestiona el buzón puede ver todo, y sin él «Mis registros» le mostraría el
 * buzón entero.
 */
export async function listarMisSugerencias(supabase: ClienteServidor, emisorId: string) {
  const { data } = await supabase
    .from("sugerencias")
    .select("id, consecutivo, tipo, proceso, estado, creado_en, respuesta_emisor")
    .eq("emisor_id", emisorId)
    .order("creado_en", { ascending: false })
    .limit(50);
  return data ?? [];
}

/**
 * La bandeja completa: los últimos 500 casos con todas sus columnas, del más
 * reciente al más antiguo. Acceso: RLS (gestiono_buzon()); a quien no
 * gestiona el buzón solo le volverían los suyos, y la página ya lo frena con
 * exigirGestorBuzon().
 */
export async function listarCasosDelBuzon(supabase: ClienteServidor) {
  const { data } = await supabase
    .from("sugerencias")
    .select("*")
    .order("creado_en", { ascending: false })
    .limit(500);
  return data ?? [];
}

/**
 * Personas activas (id y nombre), ordenadas por nombre: el selector de
 * responsable de la bandeja. Acceso: RLS de perfiles, que deja leerlos a
 * cualquiera con sesión.
 */
export async function listarPersonasActivas(supabase: ClienteServidor) {
  const { data } = await supabase.from("perfiles").select("id, nombre").eq("activo", true).order("nombre");
  return data ?? [];
}
