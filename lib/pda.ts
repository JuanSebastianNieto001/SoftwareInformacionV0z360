/**
 * PDA: etiquetas y formato de presentación. Lo que decide si un indicador
 * cumple (resultado, avance, veredicto) está en las vistas v_pda_*, para
 * que la pantalla y el resumen histórico digan siempre lo mismo.
 */
import type { AgregacionPda, SentidoPda } from "./supabase/tipos";

export const ETIQUETA_SENTIDO: Record<SentidoPda, string> = {
  mayor: "Mayor o igual a la meta",
  menor: "Menor o igual a la meta",
};

/** Símbolo corto para mostrar junto a la meta: "≥ 99 %". */
export const SIMBOLO_SENTIDO: Record<SentidoPda, string> = { mayor: "≥", menor: "≤" };

export const ETIQUETA_AGREGACION: Record<AgregacionPda, string> = {
  ultimo: "Último valor medido",
  suma: "Suma de las mediciones",
  promedio: "Promedio de las mediciones",
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-10-01" → "Octubre 2026" */
export function nombreMes(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  const mes = MESES[(m ?? 1) - 1] ?? "";
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${a}`;
}

/** "2026-10-01" → "2026-10" (valor de un input type=month). */
export function periodoAMes(periodo: string): string {
  return periodo.slice(0, 7);
}

/** Mes actual en Bogotá como "YYYY-MM". */
export function mesActual(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

const formato = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** Número con la unidad: "99,5 %", "7 tickets". */
export function conUnidad(valor: number | null | undefined, unidad: string): string {
  if (valor === null || valor === undefined) return "—";
  const n = formato.format(Number(valor));
  return unidad === "%" ? `${n} %` : `${n} ${unidad}`;
}

export function porcentaje(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return `${formato.format(Number(valor))} %`;
}
