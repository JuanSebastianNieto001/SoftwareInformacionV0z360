import { construirRutaStorage } from "@/lib/archivos";
import { leerJson, respuestaDesdePostgrest, respuestaError, respuestaOk } from "@/lib/api-errores";
import { registrarAcceso } from "@/lib/auditoria";
import { eliminarHuerfano } from "@/lib/limpieza-storage";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esquemaSubida, primerError } from "@/lib/validaciones";

export const dynamic = "force-dynamic";

/**
 * Paso 2 de la subida. El navegador ya subió el archivo a
 * `<area_id>/<documento_id>/<archivo>` (RLS del bucket exigió nivel
 * 'edicion'). Aquí:
 *
 *  1. Validamos el cuerpo con Zod.
 *  2. Confirmamos que el objeto existe en Storage y tomamos su tamaño y
 *     MIME reales (no los que dice el cliente).
 *  3. Insertamos los metadatos con el cliente de sesión: RLS decide.
 *  4. Si el insert falla, borramos el archivo para no dejar huérfanos.
 *  5. Registramos el acceso 'subir'.
 */
export async function POST(req: Request) {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return respuestaError("No autorizado", 401);

  const parsed = esquemaSubida.safeParse(await leerJson(req));
  if (!parsed.success) return respuestaError(primerError(parsed.error), 400);
  const d = parsed.data;

  const storagePath = construirRutaStorage(d.area_id, d.id, d.nombre_archivo);

  // 2. El objeto debe existir (lo subió este usuario hace un instante).
  const { data: objetos, error: errorLista } = await supabase.storage
    .from("documentos")
    .list(`${d.area_id}/${d.id}`, { limit: 20 });

  if (errorLista) {
    return respuestaError(`No se pudo verificar el archivo en Storage: ${errorLista.message}`, 502);
  }
  const objeto = objetos?.find((o) => o.name === d.nombre_archivo);
  if (!objeto) {
    return respuestaError(
      "El archivo no aparece en el almacenamiento. Vuelve a intentar la subida.",
      400,
    );
  }

  const meta = (objeto.metadata ?? {}) as { size?: number; mimetype?: string };
  const tamano = typeof meta.size === "number" ? meta.size : d.tamano_bytes;
  const mime = typeof meta.mimetype === "string" && meta.mimetype ? meta.mimetype : d.mime;

  // 3. Insert de metadatos. RLS: nivel_en_area = 'edicion', subido_por = auth.uid(),
  //    storage_path con prefijo del área.
  const { data: doc, error } = await supabase
    .from("documentos")
    .insert({
      id: d.id,
      area_id: d.area_id,
      titulo: d.titulo,
      descripcion: d.descripcion,
      etiquetas: d.etiquetas,
      storage_path: storagePath,
      nombre_archivo: d.nombre_archivo,
      mime,
      tamano_bytes: tamano,
      vigente_desde: d.vigente_desde,
      vigente_hasta: d.vigente_hasta,
      subido_por: user.id,
      actualizado_por: user.id,
    })
    .select("id, titulo, areas(nombre)")
    .single();

  if (error || !doc) {
    // 4. Sin metadatos no hay documento: retiramos el binario.
    await eliminarHuerfano(storagePath);
    if (error) return respuestaDesdePostgrest(error);
    return respuestaError("No se pudo registrar el documento.", 500);
  }

  // 5. Auditoría.
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre")
    .eq("id", user.id)
    .maybeSingle();

  await registrarAcceso(supabase, user, {
    accion: "subir",
    documento: { id: doc.id, titulo: doc.titulo, area_nombre: doc.areas?.nombre ?? "" },
    perfilNombre: perfil?.nombre ?? "",
    request: req,
  });

  return respuestaOk({ id: doc.id }, 201);
}
