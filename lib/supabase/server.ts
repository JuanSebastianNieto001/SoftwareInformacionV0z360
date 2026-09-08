import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./tipos";
import { clavePublicaSupabase, urlSupabase } from "./env";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route
 * Handlers. Lleva la sesión del usuario (cookies), por lo que TODAS las
 * consultas que haga pasan por RLS con la identidad de quien navega.
 *
 * Este es el cliente que debe usarse por defecto en el servidor.
 */
export async function crearClienteServidor() {
  const almacen = await cookies();

  return createServerClient<Database>(urlSupabase(), clavePublicaSupabase(), {
    cookies: {
      getAll() {
        return almacen.getAll();
      },
      setAll(cookiesAEscribir) {
        try {
          cookiesAEscribir.forEach(({ name, value, options }) =>
            almacen.set(name, value, options),
          );
        } catch {
          // Llamado desde un Server Component: no se pueden escribir cookies.
          // No es un problema si proxy.ts está refrescando la sesión.
        }
      },
    },
  });
}

export type ClienteServidor = Awaited<ReturnType<typeof crearClienteServidor>>;
