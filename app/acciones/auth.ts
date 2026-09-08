"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { registrarAcceso } from "@/lib/auditoria";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  esquemaCambioContrasena,
  esquemaLogin,
  primerError,
} from "@/lib/validaciones";

export type EstadoFormulario = { error: string | null };

/** Solo permitimos volver a rutas internas (evita open redirect). */
function destinoSeguro(valor: unknown): string {
  if (typeof valor !== "string") return "/";
  if (!valor.startsWith("/") || valor.startsWith("//")) return "/";
  if (valor.startsWith("/login") || valor.startsWith("/api/")) return "/";
  return valor;
}

export async function iniciarSesion(
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const parsed = esquemaLogin.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: primerError(parsed.error) };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    return { error: "Correo o contraseña incorrectos." };
  }

  // El perfil lo crea el trigger al registrar el usuario. Si está
  // desactivado, cerramos la sesión de inmediato.
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre, activo")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!perfil?.activo) {
    await supabase.auth.signOut();
    return {
      error: "Tu usuario está desactivado. Comunícate con el administrador.",
    };
  }

  await supabase
    .from("perfiles")
    .update({ ultimo_login: new Date().toISOString() })
    .eq("id", data.user.id);

  await registrarAcceso(supabase, data.user, {
    accion: "login",
    perfilNombre: perfil.nombre,
    request: { headers: await headers() },
  });

  if (data.user.user_metadata?.debe_cambiar_contrasena === true) {
    redirect("/cambiar-contrasena");
  }

  redirect(destinoSeguro(formData.get("volver")));
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function cambiarContrasena(
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const parsed = esquemaCambioContrasena.safeParse({
    password: formData.get("password"),
    confirmacion: formData.get("confirmacion"),
  });
  if (!parsed.success) return { error: primerError(parsed.error) };

  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: { debe_cambiar_contrasena: false },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("different from the old")) {
      return { error: "La nueva contraseña debe ser distinta de la actual." };
    }
    if (msg.includes("weak") || msg.includes("pwned")) {
      return { error: "La contraseña es demasiado débil o ya se filtró en internet. Elige otra." };
    }
    return { error: `No se pudo cambiar la contraseña: ${error.message}` };
  }

  redirect("/");
}
