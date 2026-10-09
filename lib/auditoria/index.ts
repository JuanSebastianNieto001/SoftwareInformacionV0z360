// Escritura del registro de auditoría (tabla `accesos`, que /admin/auditoria
// lee con lib/auditoria/consulta.ts). Lo comparten Route Handlers, acciones de
// servidor y páginas; por eso recibe un cliente ya creado y cualquier objeto
// con cabeceras, en lugar de exigir un Request.
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Accion, Database } from "@/lib/supabase/tipos";

type Cliente = SupabaseClient<Database>;

/** Cualquier cosa con cabeceras: un Request o `{ headers: await headers() }`. */
export type ConCabeceras = { headers: Headers };

export type DatosAcceso = {
  accion: Accion;
  documento?: {
    id: string | null;
    titulo: string;
    area_nombre?: string | null;
  } | null;
  perfilNombre?: string | null;
  request?: ConCabeceras | null;
};

/** IP real del cliente detrás de Vercel (primer valor de x-forwarded-for). */
export function ipDePeticion(req: ConCabeceras | null | undefined): string | null {
  if (!req) return null;
  // Se recorta a 64 caracteres: la cabecera la pone quien llama y no hay
  // motivo para guardar —ni para indexar— una cadena arbitrariamente larga.
  const recortar = (v: string | null) => v?.trim().slice(0, 64) || null;
  const reenviada = req.headers.get("x-forwarded-for");
  if (reenviada) return recortar(reenviada.split(",")[0] ?? null);
  return recortar(req.headers.get("x-real-ip"));
}

/**
 * Inserta una fila en `accesos` con la identidad del usuario de la sesión.
 * Se llama EXPLÍCITAMENTE desde los endpoints (abrir, descargar, subir,
 * editar, eliminar, login): una lectura no dispara triggers, así que si
 * no se llama aquí, no queda rastro.
 *
 * La política RLS `accesos_insert_propio` exige usuario_id = auth.uid(),
 * por lo que un usuario no puede fabricar registros a nombre de otro.
 *
 * Nunca lanza: un fallo de auditoría se registra en consola y se devuelve
 * para que el llamador decida (en "abrir" se aborta: sin rastro no hay
 * acceso).
 */
export async function registrarAcceso(
  supabase: Cliente,
  user: User,
  datos: DatosAcceso,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("accesos").insert({
    usuario_id: user.id,
    usuario_email: user.email ?? "",
    usuario_nombre: datos.perfilNombre ?? "",
    documento_id: datos.documento?.id ?? null,
    doc_titulo: datos.documento?.titulo ?? "",
    area_nombre: datos.documento?.area_nombre ?? "",
    accion: datos.accion,
    ip: ipDePeticion(datos.request),
    user_agent: datos.request?.headers.get("user-agent") ?? null,
  });

  if (error) {
    console.error("[auditoria] No se pudo registrar el acceso:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
