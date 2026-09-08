import { registrarAcceso } from "@/lib/auditoria";
import { crearClienteServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Segundos de validez de la URL firmada: alcanza para abrir, no para reenviar. */
const SEGUNDOS_FIRMA = 60;

const SIN_CACHE = { "Cache-Control": "no-store, private" };

/**
 * PIEZA CRÍTICA. Único camino por el que un archivo llega al navegador.
 *
 *  1. RLS decide si el usuario puede ver el documento (permiso de área y
 *     ventana de vigencia). Si no, `doc` es null → 404.
 *  2. Se registra el acceso ANTES de entregar nada. Si el registro falla,
 *     no se entrega el archivo: sin rastro no hay acceso.
 *  3. Se firma la ruta privada por 60 s y se redirige.
 *
 * `?descargar=1` fuerza la descarga (Content-Disposition: attachment) y
 * registra la acción como "descargar" en lugar de "abrir".
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401, headers: SIN_CACHE });

  // RLS decide: si no tiene permiso o está vencido, doc viene null.
  const { data: doc } = await supabase
    .from("documentos")
    .select("id, titulo, storage_path, nombre_archivo, purgado_en, areas(nombre)")
    .eq("id", id)
    .maybeSingle();

  if (!doc) return new Response("No encontrado", { status: 404, headers: SIN_CACHE });

  if (doc.purgado_en) {
    return new Response("El archivo fue purgado por vencimiento y ya no está disponible.", {
      status: 410,
      headers: SIN_CACHE,
    });
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre")
    .eq("id", user.id)
    .maybeSingle();

  const descargar = new URL(req.url).searchParams.get("descargar") === "1";

  const auditoria = await registrarAcceso(supabase, user, {
    accion: descargar ? "descargar" : "abrir",
    documento: { id: doc.id, titulo: doc.titulo, area_nombre: doc.areas?.nombre ?? "" },
    perfilNombre: perfil?.nombre ?? "",
    request: req,
  });

  if (!auditoria.ok) {
    return new Response("No se pudo registrar el acceso; inténtalo de nuevo.", {
      status: 500,
      headers: SIN_CACHE,
    });
  }

  const { data: firmada, error } = await supabase.storage
    .from("documentos")
    .createSignedUrl(
      doc.storage_path,
      SEGUNDOS_FIRMA,
      descargar ? { download: doc.nombre_archivo } : undefined,
    );

  if (error || !firmada) {
    console.error("[abrir] Error al firmar", doc.id, error?.message);
    return new Response("Error al firmar", { status: 500, headers: SIN_CACHE });
  }

  return new Response(null, {
    status: 302,
    headers: { ...SIN_CACHE, Location: firmada.signedUrl },
  });
}
