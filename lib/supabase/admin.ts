import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./tipos";
import { urlSupabase } from "./env";

/**
 * Cliente con la clave service_role. SALTA RLS.
 *
 * Reglas de uso (no negociables):
 *  - Solo se importa desde Route Handlers (app/api/**). El import de
 *    "server-only" hace que el build falle si alguien lo importa desde un
 *    componente cliente.
 *  - Antes de usarlo, el handler debe haber verificado con el cliente de
 *    sesión (RLS) que quien llama tiene derecho (p. ej. rpc('soy_admin')).
 *  - Nunca se usa para leer documentos ni auditoría en nombre de un usuario.
 */
export function crearClienteAdmin() {
  const clave =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!clave) {
    throw new Error(
      "Falta la variable SUPABASE_SERVICE_ROLE_KEY (solo servidor, sin NEXT_PUBLIC_)",
    );
  }

  return createClient<Database>(urlSupabase(), clave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type ClienteAdmin = ReturnType<typeof crearClienteAdmin>;
