import type { ClienteNavegador } from "./supabase/client";
import { clavePublicaSupabase } from "./supabase/env";
import { esMimePermitido, mimePorExtension } from "./archivos";
import { TAMANO_MAXIMO_BYTES, type MimePermitido } from "./validaciones";

/**
 * Normaliza el File antes de subir: algunos navegadores móviles no
 * informan el MIME (queda vacío) y el bucket lo rechazaría. Si la
 * extensión es conocida, forzamos el tipo correcto.
 */
export function normalizarArchivo(archivo: File): { archivo: File; mime: MimePermitido } | { error: string } {
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return { error: "El archivo supera el máximo de 50 MB." };
  }
  if (archivo.size === 0) return { error: "El archivo está vacío." };

  const porExtension = mimePorExtension(archivo.name);
  const mime = esMimePermitido(archivo.type) ? archivo.type : porExtension;
  if (!mime) {
    return { error: "Tipo de archivo no permitido. Usa PDF, JPG, PNG, Word, Excel o PowerPoint." };
  }
  // Si la extensión y el tipo declarado no coinciden, mandamos el de la extensión.
  const mimeFinal = porExtension ?? mime;
  const normalizado =
    archivo.type === mimeFinal ? archivo : new File([archivo], archivo.name, { type: mimeFinal });
  return { archivo: normalizado, mime: mimeFinal };
}

/** Traduce errores del servicio de Storage a mensajes para el usuario. */
export function traducirErrorStorage(mensaje: string, status?: number): string {
  const m = mensaje.toLowerCase();
  if (status === 403 || m.includes("row-level security") || m.includes("unauthorized") || m.includes("not allowed")) {
    return "No tienes permiso de edición en esta área.";
  }
  if (m.includes("mime type") || m.includes("mimetype")) return "Tipo de archivo no permitido por el almacenamiento.";
  if (m.includes("maximum allowed size") || m.includes("payload too large") || status === 413) {
    return "El archivo supera el tamaño máximo permitido (50 MB).";
  }
  if (m.includes("already exists") || status === 409) return "Ya existe un archivo con ese nombre para este documento.";
  if (m.includes("bucket not found")) return "El bucket 'documentos' no existe. Revisa la configuración de Supabase.";
  return mensaje || "Error al subir el archivo.";
}

function mensajeDeRespuesta(texto: string): string {
  try {
    const j = JSON.parse(texto) as { message?: string; error?: string; msg?: string };
    return j.message ?? j.error ?? j.msg ?? texto;
  } catch {
    return texto;
  }
}

/**
 * Sube un archivo directamente a Storage con barra de progreso.
 *
 *  1. createSignedUploadUrl(): el servidor de Storage evalúa la política
 *     RLS de inserción con el JWT del usuario. Si no tiene 'edicion' en
 *     el área, falla aquí y no se transfiere ni un byte.
 *  2. PUT multipart a la URL firmada con XMLHttpRequest, que sí expone
 *     eventos de progreso (fetch no lo hace). Replica el formato que usa
 *     storage-js en uploadToSignedUrl().
 */
export async function subirArchivoConProgreso(
  supabase: ClienteNavegador,
  ruta: string,
  archivo: File,
  opciones: { upsert?: boolean; onProgreso?: (fraccion: number) => void; signal?: AbortSignal } = {},
): Promise<void> {
  const { upsert = false, onProgreso, signal } = opciones;

  const { data: firmada, error } = await supabase.storage
    .from("documentos")
    .createSignedUploadUrl(ruta, { upsert });

  if (error || !firmada) {
    const status = (error as { statusCode?: string | number } | null)?.statusCode;
    throw new Error(traducirErrorStorage(error?.message ?? "", Number(status) || undefined));
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", firmada.signedUrl, true);
    xhr.setRequestHeader("x-upsert", String(upsert));
    xhr.setRequestHeader("apikey", clavePublicaSupabase());
    if (session?.access_token) {
      xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgreso) onProgreso(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgreso?.(1);
        resolve();
      } else {
        reject(new Error(traducirErrorStorage(mensajeDeRespuesta(xhr.responseText), xhr.status)));
      }
    };
    xhr.onerror = () => reject(new Error("Error de red durante la subida. Revisa tu conexión e inténtalo de nuevo."));
    xhr.onabort = () => reject(new Error("Subida cancelada."));
    xhr.ontimeout = () => reject(new Error("La subida tardó demasiado. Inténtalo con mejor señal."));
    xhr.timeout = 10 * 60 * 1000;

    if (signal) {
      if (signal.aborted) return reject(new Error("Subida cancelada."));
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    const cuerpo = new FormData();
    cuerpo.append("cacheControl", "3600");
    cuerpo.append("", archivo, archivo.name);
    xhr.send(cuerpo);
  });
}

/** Llama a la API interna y devuelve JSON o lanza con el mensaje del servidor. */
export async function llamarApi<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const texto = await res.text();
  let cuerpo: unknown = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = null;
  }
  if (!res.ok) {
    const msg =
      (cuerpo as { error?: string } | null)?.error ?? (texto || `Error ${res.status}`);
    throw new Error(msg);
  }
  return cuerpo as T;
}
