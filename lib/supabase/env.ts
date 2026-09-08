/**
 * Lectura centralizada de las variables públicas de Supabase.
 *
 * Acepta tanto las claves heredadas (anon key, JWT largo) como las claves
 * nuevas (sb_publishable_...). Ambas son públicas por diseño: la seguridad
 * la aporta RLS, no el secreto de la clave.
 *
 * NUNCA leer aquí SUPABASE_SERVICE_ROLE_KEY: ese valor solo existe en
 * lib/supabase/admin.ts, que está marcado como server-only.
 */
export function urlSupabase(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("Falta la variable NEXT_PUBLIC_SUPABASE_URL");
  }
  return url;
}

export function clavePublicaSupabase(): string {
  const clave =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!clave) {
    throw new Error(
      "Falta la variable NEXT_PUBLIC_SUPABASE_ANON_KEY (o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)",
    );
  }
  return clave;
}
