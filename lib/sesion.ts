import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { crearClienteServidor, type ClienteServidor } from "./supabase/server";
import type { Perfil } from "./supabase/tipos";

export type Sesion = {
  supabase: ClienteServidor;
  user: User;
  perfil: Perfil;
};

/**
 * Lee usuario y perfil una sola vez por petición (React cache) para que
 * layout y página compartan el resultado.
 *
 * Nota: la autorización sigue viviendo en RLS. Esto solo sirve para
 * decidir redirecciones y qué pintar.
 */
const obtenerSesion = cache(async () => {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, perfil: null };

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, user, perfil: perfil ?? null };
});

/** Usuario autenticado, con perfil activo y contraseña ya cambiada. */
export async function exigirSesion(): Promise<Sesion> {
  const { supabase, user, perfil } = await obtenerSesion();

  if (!user) redirect("/login");

  // Sin perfil (no debería pasar: lo crea el trigger) o desactivado:
  // cerramos la sesión desde un Route Handler, que sí puede borrar cookies.
  if (!perfil || !perfil.activo) redirect("/api/auth/salir?motivo=inactivo");

  if (user.user_metadata?.debe_cambiar_contrasena === true) {
    redirect("/cambiar-contrasena");
  }

  return { supabase, user, perfil };
}

/** Como exigirSesion, pero además el rol debe ser admin (guardia de UI). */
export async function exigirAdmin(): Promise<Sesion> {
  const sesion = await exigirSesion();
  if (sesion.perfil.rol !== "admin") redirect("/");
  return sesion;
}

/** Para páginas que necesitan sesión pero toleran contraseña pendiente. */
export async function sesionOpcional() {
  return obtenerSesion();
}
