// API de /admin/usuarios (components/admin/gestion-usuarios.tsx): listar, crear
// y editar cuentas. Lo que vive en Auth (alta, contraseña, bloqueo de login,
// cierre de sesiones) se hace con la clave de servicio; lo que vive en
// `perfiles` (rol, activo, nombre, cargo) va con la sesión del administrador,
// para que RLS siga siendo quien autoriza la elevación de privilegios.
import { exigirAdminApi } from "@/lib/api/admin";
import { leerJson, mensajePostgrest, respuestaError, respuestaOk } from "@/lib/api/errores";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import type { NivelAcceso, Tablas } from "@/lib/supabase/tipos";
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
  gestiona_buzon: boolean;
  /** Lo guardado en permisos_area, sin aplicar el techo del rol. */
  permisos: { area_id: string; nivel: NivelAcceso }[];
  /** Ids de los grupos a los que pertenece. */
  grupos: string[];
};

/** Las áreas viajan con la lista para poder filtrar por ellas sin otra llamada. */
export type AreaBreve = { id: string; nombre: string; activa: boolean };
export type GrupoBreve = { id: string; nombre: string; activo: boolean };

/**
 * Único lugar (junto con la Edge Function) donde se usa la service_role
 * key. Cada método empieza por exigirAdminApi(), que pregunta a Postgres
 * (soy_admin) con la sesión del llamador.
 */

export async function GET() {
  const ctx = await exigirAdminApi();
  if (ctx.error) return ctx.error;

  const admin = crearClienteAdmin();
  const [
    { data: perfiles, error: errorPerfiles },
    { data: lista, error: errorAuth },
    { data: permisos },
    { data: areas },
    { data: miembros },
    { data: grupos },
  ] = await Promise.all([
    ctx.supabase.from("perfiles").select("*").order("nombre"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ctx.supabase.from("permisos_area").select("usuario_id, area_id, nivel"),
    ctx.supabase.from("areas").select("id, nombre, activa").order("nombre"),
    ctx.supabase.from("grupos_usuarios").select("grupo_id, usuario_id"),
    ctx.supabase.from("grupos").select("id, nombre, activo").order("nombre"),
  ]);

  if (errorPerfiles) return respuestaError(mensajePostgrest(errorPerfiles).mensaje, 500);
  if (errorAuth) return respuestaError(`No se pudo listar usuarios: ${errorAuth.message}`, 502);

  const porId = new Map(lista.users.map((u) => [u.id, u]));
  const gruposDe = new Map<string, string[]>();
  for (const m of miembros ?? []) {
    gruposDe.set(m.usuario_id, [...(gruposDe.get(m.usuario_id) ?? []), m.grupo_id]);
  }
  const porUsuario = new Map<string, { area_id: string; nivel: NivelAcceso }[]>();
  for (const p of permisos ?? []) {
    const suyos = porUsuario.get(p.usuario_id) ?? [];
    suyos.push({ area_id: p.area_id, nivel: p.nivel });
    porUsuario.set(p.usuario_id, suyos);
  }
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
      gestiona_buzon: p.gestiona_buzon,
      permisos: porUsuario.get(p.id) ?? [],
      grupos: gruposDe.get(p.id) ?? [],
    };
  });

  return respuestaOk({ usuarios, areas: areas ?? [], grupos: grupos ?? [] });
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
    // Solo el nombre y la marca de cambio de contraseña. El rol NO viaja
    // aquí: el trigger dejó de leerlo del metadata porque ese campo lo
    // escribe quien llama, y con el registro público abierto era la vía
    // para que cualquiera se hiciera administrador.
    user_metadata: { nombre: d.nombre, debe_cambiar_contrasena: d.exigir_cambio },
  });

  if (error || !data.user) {
    const msg = error?.message ?? "";
    if (/already|registered|exists/i.test(msg)) {
      return respuestaError("Ya existe un usuario con ese correo.", 409);
    }
    return respuestaError(`No se pudo crear el usuario: ${msg}`, 502);
  }

  // El trigger creó el perfil como lector e inactivo. Elevarlo es un acto
  // deliberado de un administrador ya autenticado, y pasa por RLS
  // (perfiles_admin_all) con SU sesión, no con la clave de servicio.
  const { error: errorPerfil } = await ctx.supabase
    .from("perfiles")
    .update({ nombre: d.nombre, cargo: d.cargo ?? null, rol: d.rol, activo: true })
    .eq("id", data.user.id);

  if (errorPerfil) {
    // Si no se pudo activar, la cuenta queda inerte en lugar de a medias.
    await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    return respuestaError(
      `No se pudo completar el perfil, el usuario no se creó: ${errorPerfil.message}`,
      502,
    );
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
    // La casilla del formulario manda: normalmente se exige el cambio, pero
    // el administrador puede dar una contrasena definitiva si hace falta.
    cambiosAuth.user_metadata = {
      ...(actual?.user?.user_metadata ?? {}),
      debe_cambiar_contrasena: d.exigir_cambio,
    };
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
