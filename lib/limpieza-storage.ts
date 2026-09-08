import "server-only";

import { crearClienteAdmin } from "./supabase/admin";

/**
 * Borra un objeto de Storage SOLO si ninguna fila de `documentos` lo
 * referencia. Se usa para no dejar huérfanos cuando la subida del archivo
 * salió bien pero el insert/update de metadatos falló, o para retirar la
 * versión anterior tras un reemplazo.
 *
 * Usa service_role porque los editores no tienen permiso de borrado en el
 * bucket (solo el admin). La comprobación previa hace que la operación
 * sea segura aunque el llamador envíe una ruta ajena: si el archivo
 * pertenece a un documento real, no se toca.
 */
export async function eliminarHuerfano(storagePath: string): Promise<boolean> {
  if (!storagePath || storagePath.startsWith("purgado/")) return false;

  try {
    const admin = crearClienteAdmin();

    const { count, error: errorConsulta } = await admin
      .from("documentos")
      .select("id", { count: "exact", head: true })
      .eq("storage_path", storagePath);

    if (errorConsulta) {
      console.error("[limpieza] No se pudo verificar referencias:", errorConsulta.message);
      return false;
    }
    if ((count ?? 0) > 0) {
      console.warn("[limpieza] Se omitió borrar un archivo aún referenciado:", storagePath);
      return false;
    }

    const { error } = await admin.storage.from("documentos").remove([storagePath]);
    if (error) {
      console.error("[limpieza] No se pudo borrar el huérfano:", storagePath, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[limpieza] Excepción al borrar huérfano:", e);
    return false;
  }
}
