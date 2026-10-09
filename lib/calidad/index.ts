/**
 * Calidad (QualityCore): etiquetas, estados y el cálculo de la nota en
 * TypeScript, espejo de v_calidad_evaluaciones. Se repite aquí para que la
 * pantalla de auditoría muestre la nota mientras el analista marca ítems;
 * si las dos discrepan, manda la vista.
 */
import type { CalidadResultado } from "@/lib/supabase/tipos";
import {
  CANALES_AUDITORIA,
  ESTADOS_COMPROMISO,
  ETAPAS_AUDITORIA,
  RESULTADOS_CALIDAD,
  TIPOS_AUDITORIA,
} from "@/lib/validaciones";

// Las listas viven en validaciones.ts (las usa el esquema); aquí se reexportan.
export { CANALES_AUDITORIA as CANALES, ESTADOS_COMPROMISO, ETAPAS_AUDITORIA, RESULTADOS_CALIDAD as RESULTADOS, TIPOS_AUDITORIA };

export const ETIQUETA_RESULTADO: Record<CalidadResultado, string> = {
  cumple: "Cumple",
  no_cumple: "No cumple",
  no_aplica: "No aplica",
};

export const ETIQUETA_ESTADO_EVALUACION_CALIDAD = { borrador: "Borrador", publicada: "Publicada" } as const;

export const ETIQUETA_ESTADO_RETRO = {
  pendiente: "Pendiente por realizar",
  en_proceso: "En proceso",
  firmada: "Firmada por el asesor",
} as const;

export const ETIQUETA_ESTADO_COMPROMISO = {
  pendiente: "Pendiente",
  en_seguimiento: "En seguimiento",
  cumplido: "Cumplido",
  no_cumplido: "No cumplido",
} as const;

export const ETIQUETA_CANAL: Record<(typeof CANALES_AUDITORIA)[number], string> = {
  llamada: "Llamada",
  chat: "Chat",
  correo: "Correo",
  otro: "Otro",
};

export type ItemParaNota = { id: string; peso: number; es_fatal: boolean; activo: boolean };

export type ResultadoNota = {
  /** % sobre el peso aplicable, sin contar errores críticos. Null si nada aplica. */
  notaSinIc: number | null;
  /** 0 si falla un crítico y la matriz anula; si no, igual a notaSinIc. */
  notaFinal: number | null;
  fatalesFallados: number;
  respondidos: number;
  total: number;
  pesoAplicable: number;
  pesoCumplido: number;
};

/**
 * Misma fórmula que la vista:
 *   nota_sin_ic = Σ peso(cumple) / Σ peso(cumple + no cumple) × 100, solo ítems no críticos
 *   nota_final  = 0 si hay crítico en "no cumple" y la matriz anula; si no, nota_sin_ic
 * Los "no aplica" salen del denominador: no premian ni castigan.
 */
export function calcularNota(
  items: readonly ItemParaNota[],
  respuestas: Record<string, CalidadResultado | undefined>,
  errorFatalAnula: boolean,
): ResultadoNota {
  let pesoAplicable = 0;
  let pesoCumplido = 0;
  let fatalesFallados = 0;
  let respondidos = 0;
  let total = 0;
  for (const it of items) {
    if (!it.activo) continue;
    total += 1;
    const r = respuestas[it.id];
    if (!r) continue;
    respondidos += 1;
    if (it.es_fatal) {
      if (r === "no_cumple") fatalesFallados += 1;
      continue;
    }
    if (r === "no_aplica") continue;
    pesoAplicable += it.peso;
    if (r === "cumple") pesoCumplido += it.peso;
  }
  const notaSinIc = pesoAplicable > 0 ? Math.round((pesoCumplido / pesoAplicable) * 10000) / 100 : null;
  const notaFinal = notaSinIc === null ? null : errorFatalAnula && fatalesFallados > 0 ? 0 : notaSinIc;
  return { notaSinIc, notaFinal, fatalesFallados, respondidos, total, pesoAplicable, pesoCumplido };
}

const fmt = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

export function formatearPorcentaje(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? "—" : `${fmt.format(n)} %`;
}

/** Color de la insignia de nota contra el umbral de la matriz. */
export function varianteNotaCalidad(
  nota: number | null | undefined,
  minima: number,
): "default" | "secondary" | "destructive" | "outline" {
  if (nota === null || nota === undefined) return "outline";
  if (nota >= minima) return "default";
  if (nota >= minima - 15) return "secondary";
  return "destructive";
}

/** Suma de pesos de los ítems activos no críticos: debe ser 100 % para poder publicar (los bloques de la matriz suman 15 + 45 + 40). */
export function sumaPesos(items: readonly ItemParaNota[]): number {
  return Math.round(items.filter((i) => i.activo && !i.es_fatal).reduce((a, i) => a + i.peso, 0) * 100) / 100;
}
