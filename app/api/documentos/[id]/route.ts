import { leerJson, respuestaDesdePostgrest, respuestaError, respuestaOk } from "@/lib/api-errores";
import { registrarAcceso } from "@/lib/auditoria";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esquemaEdicionDocumento, primerError } from "@/lib/validaciones";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Edita metadatos (título, descripción, etiquetas, vigencia). RLS: nivel 'edicion'. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return respuestaError("No autorizado", 401);

  const parsed = esquemaEdicionDocumento.safeParse(await leerJson(req));
  if (!parsed.success) return respuestaError(primerError(parsed.error), 400);
  const d = parsed.data;

  const { data: doc, error } = await supabase
    .from("documentos")
    .update({
      titulo: d.titulo,
      descripcion: d.descripcion,
      etiquetas: d.etiquetas,
      vigente_desde: d.vigente_desde,
      vigente_hasta: d.vigente_hasta,
      actualizado_por: user.id,
    })
    .eq("id", id)
    .select("id, titulo, areas(nombre)")
    .maybeSingle();

  if (error) return respuestaDesdePostgrest(error);
  // Sin error pero sin fila: RLS no dejó ver/editar el documento.
  if (!doc) return respuestaError("No encontrado o sin permiso de edición.", 404);

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre")
    .eq("id", user.id)
    .maybeSingle();

  await registrarAcceso(supabase, user, {
    accion: "editar",
    documento: { id: doc.id, titulo: doc.titulo, area_nombre: doc.areas?.nombre ?? "" },
    perfilNombre: perfil?.nombre ?? "",
    request: req,
  });

  return respuestaOk({ id: doc.id });
}

/**
 * Elimina un documento y su archivo. RLS: solo admin (documentos_delete y
 * storage_delete_documentos). Orden: auditar → borrar archivo → borrar fila,
 * para que el registro conserve el título aunque el id quede en null.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return respuestaError("No autorizado", 401);

  const { data: doc } = await supabase
    .from("documentos")
    .select("id, titulo, storage_path, purgado_en, areas(nombre, slug)")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return respuestaError("No encontrado.", 404);

  const { data: esAdmin } = await supabase.rpc("soy_admin");
  if (!esAdmin) return respuestaError("Solo el administrador puede eliminar documentos.", 403);

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre")
    .eq("id", user.id)
    .maybeSingle();

  await registrarAcceso(supabase, user, {
    accion: "eliminar",
    documento: { id: doc.id, titulo: doc.titulo, area_nombre: doc.areas?.nombre ?? "" },
    perfilNombre: perfil?.nombre ?? "",
    request: req,
  });

  if (!doc.purgado_en) {
    const { error: errorStorage } = await supabase.storage
      .from("documentos")
      .remove([doc.storage_path]);
    if (errorStorage) {
      return respuestaError(`No se pudo borrar el archivo: ${errorStorage.message}`, 502);
    }
  }

  const { data: borrado, error } = await supabase
    .from("documentos")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return respuestaDesdePostgrest(error);
  if (!borrado) return respuestaError("RLS impidió borrar el documento.", 403);

  return respuestaOk({ ok: true, area_slug: doc.areas?.slug ?? null });
}
