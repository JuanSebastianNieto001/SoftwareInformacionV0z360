/**
 * Retroalimentación operativa: etiquetas y utilidades de presentación de los
 * campos del catálogo (gravedad, severidad, estado, conformidad). Las reglas
 * de acceso y la conformidad viven en la base (RLS y responder_feedback).
 */
import type { FeedbackConformidad, FeedbackEstado, FeedbackGravedad, FeedbackSeveridad } from "@/lib/supabase/tipos";

export const GRAVEDADES: readonly FeedbackGravedad[] = ["leve", "moderado", "grave", "critico"];
export const SEVERIDADES: readonly FeedbackSeveridad[] = ["notificacion", "plan_accion", "disciplinario"];
export const ESTADOS_FEEDBACK: readonly FeedbackEstado[] = ["abierto", "en_seguimiento", "cerrado", "reincidente"];
export const CONFORMIDADES: readonly FeedbackConformidad[] = ["aceptado", "observaciones", "rechazado"];

export const ETIQUETA_GRAVEDAD: Record<FeedbackGravedad, string> = {
  leve: "Leve",
  moderado: "Moderado",
  grave: "Grave",
  critico: "Crítico",
};

export const ETIQUETA_SEVERIDAD: Record<FeedbackSeveridad, string> = {
  notificacion: "Solo notificación",
  plan_accion: "Plan de acción obligatorio",
  disciplinario: "Proceso disciplinario",
};

export const ETIQUETA_ESTADO_FEEDBACK: Record<FeedbackEstado, string> = {
  abierto: "Abierto",
  en_seguimiento: "En seguimiento",
  cerrado: "Cerrado / cumplido",
  reincidente: "Reincidente / no cumplido",
};

export const ETIQUETA_CONFORMIDAD: Record<FeedbackConformidad, string> = {
  aceptado: "Aceptado con conformidad",
  observaciones: "Aceptado con observaciones",
  rechazado: "Rechazado / en disputa",
};

/** Color del distintivo de gravedad; el texto siempre acompaña al color. */
export function varianteGravedad(g: FeedbackGravedad): "destructive" | "secondary" | "outline" {
  if (g === "critico" || g === "grave") return "destructive";
  if (g === "moderado") return "secondary";
  return "outline";
}

export function varianteEstadoFeedback(e: FeedbackEstado): "default" | "secondary" | "destructive" | "outline" {
  if (e === "cerrado") return "default";
  if (e === "reincidente") return "destructive";
  if (e === "en_seguimiento") return "secondary";
  return "outline";
}

export function varianteConformidad(c: FeedbackConformidad): "default" | "secondary" | "destructive" {
  if (c === "aceptado") return "default";
  if (c === "rechazado") return "destructive";
  return "secondary";
}
