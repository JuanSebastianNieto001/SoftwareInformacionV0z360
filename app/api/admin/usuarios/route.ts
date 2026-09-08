import { exigirAdminApi } from "@/lib/api-admin";
import { leerJson, mensajePostgrest, respuestaError, respuestaOk } from "@/lib/api-errores";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import type { Tablas } from "@/lib/supabase/tipos";
import { esquemaUsuarioEdicion, esquemaUsuarioNuevo, primerError } from "@/lib/validaciones";

export const dynamic = "force-dynamic";

/** Un siglo: equivale a bloquear el inicio de sesión de forma indefinida. */
const BLOQUEO_INDEFINIDO = "876000h";

export type UsuarioAdmin = {
  id: string;
  email: string;
  nombre: string;
  cargo: string | null;
  rol: "admin" | "editor" | "lector";
  activo: boolean;
  ultimo_login: string | null;
  creado_en: string;
  debe_cambiar_contrasena: boolean;
};

/**
 * Único lugar (junto con la Edge Function) donde se usa la service_role
 * key. Cada método empieza por exigirAdminApi(), que pregunta a Postgres
 * (soy_admin) con la sesión del llamador.
 */

export async function GET() {
  const ctx = await exigirAdminApi();
  if (ctx.error) return ctx.error;

  const admin = crearClienteAdmin();
  const [{ data: perfiles, error: errorPerfiles }, { data: lista, error: errorAuth }] = await Promise.all([
    ctx.supabase.from("perfiles").select("*").order("nombre"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  if (errorPerfiles) return respuestaError(mensajePostgrest(errorPerfiles).mensaje, 500);
  if (errorAuth) return respuestaError(`No se pudo listar usuarios: ${errorAuth.message}`, 502);

  const porId = new Map(lista.users.map((u) => [u.id, u]));
  const usuarios: UsuarioAdmin[] = (perfiles ?? []).map((p) => {
    const u = porId.get(p.id);
    return {
      id: p.id,
      email: u?.email ?? "",
      nombre: p.nombre,
      cargo: p.cargo,
      rol: p.rol,
      activo: p.activo,
      ultimo_login: p.ultimo_login,
      creado_en: p.creado_en,
      debe_cambiar_contrasena: u?.user_metadata?.debe_cambiar_contrasena === true,
    };
  });

  return respuestaOk({ usuarios });
}

export async function POST(req: Request) {
  const ctx = await exigirAdminApi();
  if (ctx.error) return ctx.error;

  const parsed = esquemaUsuarioNuevo.safeParse(await leerJson(req));
  if (!parsed.success) return respuestaError(primerError(parsed.error), 400);
  const d = parsed.data;

  const admin = crearClienteAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    // El trigger crear_perfil_nuevo_usuario lee nombre y rol de aquí.
    user_metadata: { nombre: d.nombre, rol: d.rol, debe_cambiar_contrasena: true },
  });

  if (error || !data.user) {
    const msg = error?.message ?? "";
    if (/already|registered|exists/i.test(msg)) {
      return respuestaError("Ya existe un usuario con ese correo.", 409);
    }
    return respuestaError(`No se pudo crear el usuario: ${msg}`, 502);
  }

  // El perfil ya existe (trigger). Completamos el cargo con la sesión del admin (RLS).
  if (d.cargo) {
    const { error: errorCargo } = await ctx.supabase
      .from("perfiles")
      .update({ cargo: d.cargo })
      .eq("id", data.user.id);
    if (errorCargo) console.warn("[usuarios] No se pudo guardar el cargo:", errorCargo.message);
  }

  return respuestaOk({ id: data.user.id }, 201);
}

export async function PATCH(req: Request) {
  const ctx = await exigirAdminApi();
  if (ctx.error) return ctx.error;

  const parsed = esquemaUsuarioEdicion.safeParse(await leerJson(req));
  if (!parsed.success) return respuestaError(primerError(parsed.error), 400);
  const d = parsed.data;

  // Evita que el admin se bloquee a sí mismo.
  if (d.id === ctx.user.id) {
    if (d.activo === false) return respuestaError("No puedes desactivar tu propio usuario.", 400);
    if (d.rol && d.rol !== "admin") return respuestaError("No puedes quitarte el rol de administrador.", 400);
  }

  // 1. Campos del perfil, con la sesión del admin: RLS perfiles_admin_all.
  const cambiosPerfil: Tablas["perfiles"]["Update"] = {};
  if (d.nombre !== undefined) cambiosPerfil.nombre = d.nombre;
  if (d.cargo !== undefined) cambiosPerfil.cargo = d.cargo;
  if (d.rol !== undefined) cambiosPerfil.rol = d.rol;
  if (d.activo !== undefined) cambiosPerfil.activo = d.activo;

  if (Object.keys(cambiosPerfil).length > 0) {
    const { data: fila, error } = await ctx.supabase
      .from("perfiles")
      .update(cambiosPerfil)
      .eq("id", d.id)
      .select("id")
      .maybeSingle();
    if (error) return respuestaError(mensajePostgrest(error).mensaje, mensajePostgrest(error).status);
    if (!fila) return respuestaError("Usuario no encontrado.", 404);
  }

  // 2. Cambios en Auth (service_role): bloqueo de login y contraseña.
  const admin = crearClienteAdmin();
  const cambiosAuth: Record<string, unknown> = {};

  if (d.activo === false) cambiosAuth.ban_duration = BLOQUEO_INDEFINIDO;
  if (d.activo === true) cambiosAuth.ban_duration = "none";

  if (d.nueva_contrasena) {
    const { data: actual } = await admin.auth.admin.getUserById(d.id);
    cambiosAuth.password = d.nueva_contrasena;
    cambiosAuth.user_metadata = { ...(actual?.user?.user_metadata ?? {}), debe_cambiar_contrasena: true };
  }

  if (Object.keys(cambiosAuth).length > 0) {
    const { error } = await admin.auth.admin.updateUserById(d.id, cambiosAuth);
    if (error) return respuestaError(`Perfil actualizado, pero Auth falló: ${error.message}`, 502);
  }

  // Al desactivar, cerramos sus sesiones abiertas.
  if (d.activo === false) {
    await admin.auth.admin.signOut(d.id).catch(() => undefined);
  }

  return respuestaOk({ ok: true });
}
