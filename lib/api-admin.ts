import "server-only";

import type { User } from "@supabase/supabase-js";
import { respuestaError } from "./api-errores";
import { crearClienteServidor, type ClienteServidor } from "./supabase/server";

type Resultado =
  | { error: Response; supabase?: undefined; user?: undefined }
  | { error?: undefined; supabase: ClienteServidor; user: User };

/**
 * Para Route Handlers que van a usar la clave service_role: antes de
 * tocarla, comprobamos con el cliente de sesión (RLS) que quien llama es
 * admin según la base de datos (public.soy_admin()). La decisión sigue
 * saliendo de Postgres, no de una lista en TypeScript.
 */
export async function exigirAdminApi(): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: respuestaError("No autorizado", 401) };

  const { data: esAdmin, error } = await supabase.rpc("soy_admin");
  if (error || !esAdmin) {
    return { error: respuestaError("Solo el administrador puede hacer esto.", 403) };
  }
  return { supabase, user };
}
