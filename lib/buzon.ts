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
  recibida: "Recibida",
  en_analisis: "En análisis",
  en_accion: "En acción",
  cerrada: "Cerrada",
  rechazada: "Descartada",
};

type VarianteBadge = "default" | "secondary" | "destructive" | "outline";

export const VARIANTE_ESTADO: Record<EstadoSugerencia, VarianteBadge> = {
  recibida: "default",
  en_analisis: "secondary",
  en_accion: "secondary",
  cerrada: "outline",
  rechazada: "destructive",
};

/** Los tipos que el 10.2 obliga a tratar con causa y acción, no solo a leer. */
export const TIPOS_CON_ACCION_CORRECTIVA: TipoSugerencia[] = [
  "no_conformidad",
  "queja",
];

/**
 * Radicado legible. Un caso se cita en auditoría por este número, no por su
 * UUID, así que se mantiene corto y con ceros a la izquierda para que ordene
 * bien en una hoja de cálculo.
 */
export function radicado(consecutivo: number): string {
  return `BZ-${String(consecutivo).padStart(5, "0")}`;
}
