"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./tipos";
import { clavePublicaSupabase, urlSupabase } from "./env";

/**
 * Cliente de Supabase para componentes cliente. Usa la clave pública y la
 * sesión guardada en cookies. Se emplea sobre todo para subir archivos a
 * Storage directamente desde el navegador (evita el límite de tamaño de
 * cuerpo de las funciones de Vercel) — RLS del bucket decide si puede.
 */
export function crearClienteNavegador() {
  return createBrowserClient<Database>(urlSupabase(), clavePublicaSupabase());
}

export type ClienteNavegador = ReturnType<typeof crearClienteNavegador>;
