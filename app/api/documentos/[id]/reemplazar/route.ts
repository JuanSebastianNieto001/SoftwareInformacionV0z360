import { construirRutaStorage } from "@/lib/archivos";
import { leerJson, respuestaDesdePostgrest, respuestaError, respuestaOk } from "@/lib/api-errores";
import { registrarAcceso } from "@/lib/auditoria";
import { eliminarHuerfano } from "@/lib/limpieza-storage";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esquemaReemplazo, primerError } from "@/lib/validaciones";

export const dynamic = "force-dynamic";

/**
 * Sube una versión nueva del archivo. El navegador ya subió el binario a
 * `<area_id>/<documento_id>/<archivo_nuevo>`; aquí apuntamos la fila a la
 * ruta nueva, incrementamos `version` y retiramos el archivo anterior.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return respuestaError("No autorizado", 401);

  const parsed = esquemaReemplazo.safeParse(await leerJson(req));
  if (!parsed.success) return respuestaError(primerError(parsed.error), 400);
  const d = parsed.data;

  const { data: doc } = await supabase
    .from("documentos")
    .select("id, titulo, area_id, storage_path, version, purgado_en, areas(nombre)")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return respuestaError("No encontrado.", 404);
  if (doc.purgado_en) return respuestaError("El documento fue purgado; sube uno nuevo.", 410);

  const rutaNueva = construirRutaStorage(doc.area_id, doc.id, d.nombre_archivo);
  const rutaAnterior = doc.storage_path;

  // El archivo nuevo debe existir ya en Storage.
  const { data: objetos, error: errorLista } = await supabase.storage
    .from("documentos")
    .list(`${doc.area_id}/${doc.id}`, { limit: 50 });
  if (errorLista) {
    return respuestaError(`No se pudo verificar el archivo: ${errorLista.message}`, 502);
  }
  const objeto = objetos?.find((o) => o.name === d.nombre_archivo);
  if (!objeto) {
    return respuestaError("El archivo nuevo no aparece en el almacenamiento.", 400);
  }
  const meta = (objeto.metadata ?? {}) as { size?: number; mimetype?: string };

  const { data: actualizado, error } = await supabase
    .from("documentos")
    .update({
      storage_path: rutaNueva,
      nombre_archivo: d.nombre_archivo,
      mime: typeof meta.mimetype === "string" && meta.mimetype ? meta.mimetype : d.mime,
      tamano_bytes: typeof meta.size === "number" ? meta.size : d.tamano_bytes,
      version: doc.version + 1,
      actualizado_por: user.id,
    })
    .eq("id", id)
    .eq("version", doc.version) // evita pisar un reemplazo concurrente
    .select("id, version")
    .maybeSingle();

  if (error || !actualizado) {
    // El binario nuevo quedó sin fila que lo referencie: lo retiramos.
    if (rutaNueva !== rutaAnterior) await eliminarHuerfano(rutaNueva);
    if (error) return respuestaDesdePostgrest(error);
    return respuestaError("No se pudo actualizar (sin permiso o versión desactualizada).", 409);
  }

  // Retiramos la versión anterior si cambió la ruta.
  if (rutaAnterior !== rutaNueva) await eliminarHuerfano(rutaAnterior);

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

  return respuestaOk({ id: actualizado.id, version: actualizado.version });
}
