"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensajePostgrest } from "@/lib/api-errores";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  esquemaArea,
  esquemaGrupoEdicion,
  esquemaGrupoNuevo,
  esquemaMiembroGrupo,
  esquemaPermiso,
  esquemaPermisoGrupo,
  primerError,
} from "@/lib/validaciones";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Acciones del panel de administración. Ninguna comprueba "si es admin"
 * en TypeScript: todas usan el cliente de sesión y dejan que las políticas
 * *_admin_all de RLS acepten o rechacen. Aquí solo se valida la forma de
 * los datos.
 */

function slugificar(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "area";
}

function sufijo(): string {
  return Math.random().toString(36).slice(2, 6);
}

export async function crearArea(datos: unknown): Promise<Resultado> {
  const parsed = esquemaArea.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };

  const supabase = await crearClienteServidor();
  const base = slugificar(parsed.data.nombre);

  for (const slug of [base, `${base}-${sufijo()}`]) {
    const { data, error } = await supabase
      .from("areas")
      .insert({ nombre: parsed.data.nombre, slug, descripcion: parsed.data.descripcion })
      .select("id")
      .single();

    if (!error && data) {
      revalidatePath("/admin/areas");
      revalidatePath("/admin/permisos");
      revalidatePath("/");
      return { ok: true, id: data.id };
    }
    // Slug repetido: reintentamos con sufijo. Nombre repetido: error claro.
    if (error?.code === "23505" && error.message.includes("slug")) continue;
    if (error?.code === "23505") return { ok: false, error: "Ya existe un área con ese nombre." };
    if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  }
  return { ok: false, error: "No se pudo generar un identificador único para el área." };
}

export async function actualizarArea(id: string, datos: unknown): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaArea.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("areas")
    .update({ nombre: parsed.data.nombre, descripcion: parsed.data.descripcion })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ya existe un área con ese nombre." };
    return { ok: false, error: mensajePostgrest(error).mensaje };
  }
  if (!data) return { ok: false, error: "No se encontró el área o no tienes permiso." };

  revalidatePath("/admin/areas");
  revalidatePath("/");
  return { ok: true, id };
}

export async function cambiarEstadoArea(id: string, activa: boolean): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identificador inválido" };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("areas")
    .update({ activa })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  if (!data) return { ok: false, error: "No se encontró el área o no tienes permiso." };

  revalidatePath("/admin/areas");
  revalidatePath("/");
  return { ok: true, id };
}

/** nivel null = quitar el acceso. */
export async function asignarPermiso(datos: unknown): Promise<Resultado> {
  const parsed = esquemaPermiso.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { usuario_id, area_id, nivel } = parsed.data;

  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida." };

  if (nivel === null) {
    const { error } = await supabase
      .from("permisos_area")
      .delete()
      .eq("usuario_id", usuario_id)
      .eq("area_id", area_id);
    if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  } else {
    const { error } = await supabase
      .from("permisos_area")
      .upsert(
        { usuario_id, area_id, nivel, otorgado_por: user.id, otorgado_en: new Date().toISOString() },
        { onConflict: "usuario_id,area_id" },
      );
    if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  }

  revalidatePath("/admin/permisos");
  return { ok: true };
}


// ---------------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------------

/**
 * Todo lo de abajo revalida /admin/permisos además de /admin/grupos: el
 * nivel que ve esa pantalla ya no depende solo de lo personal, así que
 * tocar un grupo cambia lo que allí se muestra.
 */
function revalidarPermisos() {
  revalidatePath("/admin/grupos");
  revalidatePath("/admin/permisos");
  revalidatePath("/admin/usuarios");
  revalidatePath("/");
}

export async function crearGrupo(datos: unknown): Promise<Resultado> {
  const parsed = esquemaGrupoNuevo.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };

  const supabase = await crearClienteServidor();
  const base = slugificar(parsed.data.nombre);

  // Dos intentos: el segundo con sufijo, por si el slug ya existía.
  for (const slug of [base, `${base}-${sufijo()}`]) {
    const { data, error } = await supabase
      .from("grupos")
      .insert({ nombre: parsed.data.nombre, slug, descripcion: parsed.data.descripcion })
      .select("id")
      .maybeSingle();
    if (!error && data) {
      revalidarPermisos();
      return { ok: true, id: data.id };
    }
    if (error && error.code !== "23505") {
      return { ok: false, error: mensajePostgrest(error).mensaje };
    }
    // 23505 sobre el nombre no se arregla con otro slug: el nombre es único.
    if (error?.message?.includes("grupos_nombre_key")) {
      return { ok: false, error: "Ya existe un grupo con ese nombre." };
    }
  }
  return { ok: false, error: "No se pudo crear el grupo." };
}

export async function actualizarGrupo(datos: unknown): Promise<Resultado> {
  const parsed = esquemaGrupoEdicion.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { id, ...cambios } = parsed.data;

  if (Object.values(cambios).every((v) => v === undefined)) return { ok: true, id };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("grupos")
    .update(cambios)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  if (!data) return { ok: false, error: "No se encontró el grupo o no tienes permiso." };

  revalidarPermisos();
  return { ok: true, id };
}

/** Mete o saca a una persona del grupo. */
export async function asignarMiembro(datos: unknown): Promise<Resultado> {
  const parsed = esquemaMiembroGrupo.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { grupo_id, usuario_id, dentro } = parsed.data;

  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida." };

  const { error } = dentro
    ? await supabase
        .from("grupos_usuarios")
        .upsert({ grupo_id, usuario_id, agregado_por: user.id }, { onConflict: "grupo_id,usuario_id" })
    : await supabase
        .from("grupos_usuarios")
        .delete()
        .eq("grupo_id", grupo_id)
        .eq("usuario_id", usuario_id);

  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };

  revalidarPermisos();
  return { ok: true };
}

/** nivel null = el grupo deja de conceder nada sobre esa área. */
export async function asignarPermisoGrupo(datos: unknown): Promise<Resultado> {
  const parsed = esquemaPermisoGrupo.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { grupo_id, area_id, nivel } = parsed.data;

  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida." };

  const { error } =
    nivel === null
      ? await supabase.from("permisos_grupo").delete().eq("grupo_id", grupo_id).eq("area_id", area_id)
      : await supabase.from("permisos_grupo").upsert(
          { grupo_id, area_id, nivel, otorgado_por: user.id, otorgado_en: new Date().toISOString() },
          { onConflict: "grupo_id,area_id" },
        );

  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };

  revalidarPermisos();
  return { ok: true };
}
