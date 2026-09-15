import type { EstadoSugerencia, TipoSugerencia } from "./supabase/tipos";

/**
 * Etiquetas y ayudas del buzón de sugerencias.
 *
 * Los textos de ayuda no son decoración: un registro ISO 9001 sirve de
 * evidencia solo si describe hechos comprobables. Pedir "qué pasó, dónde y
 * cuándo" en el propio formulario es más barato que devolver el caso.
 */

export const ETIQUETA_TIPO: Record<TipoSugerencia, string> = {
  sugerencia: "Sugerencia",
  queja: "Queja o reclamo",
  felicitacion: "Felicitación",
  no_conformidad: "No conformidad",
  oportunidad_mejora: "Oportunidad de mejora",
};

export const AYUDA_TIPO: Record<TipoSugerencia, string> = {
  sugerencia: "Una idea para hacer algo mejor, sin que nadie haya incumplido nada.",
  queja: "Algo que te afectó a ti o a un cliente y quieres que se revise.",
  felicitacion: "Un reconocimiento. También es retroalimentación y se registra igual.",
  no_conformidad: "Se incumplió un requisito, un procedimiento o un compromiso con el cliente.",
  oportunidad_mejora: "Un proceso funciona, pero detectaste que puede dar más.",
};

/**
 * Area o cargo de quien reporta. Se guardan claves y no etiquetas para poder
 * cambiar el texto mostrado sin reescribir los registros ya enviados.
 */
export const ETIQUETA_AREA_REPORTE: Record<string, string> = {
  team_leader: "Team leader",
  asesor: "Asesor",
  administrativo: "Administrativo",
  gerencia: "Gerencia",
};

/** Etiqueta legible, tolerando cualquier valor fuera de la lista. */
export function etiquetaArea(valor: string): string {
  return ETIQUETA_AREA_REPORTE[valor] ?? valor;
}

export const ETIQUETA_ESTADO: Record<EstadoSugerencia, string> = {
  recibida: "Sin gestionar",
  en_proceso: "En proceso",
  cerrada: "Cerrada",
  rechazada: "Rechazada",
};

type VarianteBadge = "default" | "secondary" | "destructive" | "outline";

export const VARIANTE_ESTADO: Record<EstadoSugerencia, VarianteBadge> = {
  recibida: "default",
  en_proceso: "secondary",
  cerrada: "outline",
  rechazada: "destructive",
};

/**
 * Radicado legible. Un caso se cita en auditoría por este número, no por su
 * UUID, así que se mantiene corto y con ceros a la izquierda para que ordene
 * bien en una hoja de cálculo.
 */
export function radicado(consecutivo: number): string {
  return `BZ-${String(consecutivo).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// Evidencia de la respuesta
// ---------------------------------------------------------------------------

/**
 * La prueba de que se contestó por correo. Se acepta imagen o PDF: un
 * pantallazo suele ser PNG o JPG, pero quien imprime el correo a PDF no
 * debería quedarse fuera por eso.
 */
export const MIME_EVIDENCIA = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const;

/** Debe coincidir con el file_size_limit del bucket `evidencias`. */
export const TAMANO_MAXIMO_EVIDENCIA = 10 * 1024 * 1024;

export const ACCEPT_EVIDENCIA = [".png", ".jpg", ".jpeg", ".webp", ".pdf", ...MIME_EVIDENCIA].join(
  ",",
);

/** Ruta en el bucket privado: <sugerencia_id>/<archivo>. */
export function rutaEvidencia(sugerenciaId: string, nombreArchivo: string): string {
  return `${sugerenciaId}/${nombreArchivo}`;
}

/** Devuelve el motivo del rechazo, o null si el archivo sirve. */
export function motivoRechazoEvidencia(archivo: File): string | null {
  if (archivo.size === 0) return "El archivo está vacío.";
  if (archivo.size > TAMANO_MAXIMO_EVIDENCIA) return "La evidencia supera el máximo de 10 MB.";
  if (!(MIME_EVIDENCIA as readonly string[]).includes(archivo.type)) {
    return "La evidencia debe ser una imagen (PNG, JPG, WEBP) o un PDF.";
  }
  return null;
}
