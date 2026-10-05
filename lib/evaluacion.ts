import type { PerspectivaEvaluacion } from "./supabase/tipos";

/**
 * Evaluación de desempeño 360°: etiquetas, escalas y las FÓRMULAS del
 * Excel (EVALUACION_DE_DESEMPENO_360_VOZ360.xlsx) escritas en TypeScript.
 *
 * Las vistas v_evaluacion_resultados y v_evaluacion_360 calculan lo mismo
 * en Postgres. Aquí se repite para que la pantalla recalcule mientras se
 * escribe, como hace la hoja; si algún día discrepan, manda la vista.
 */

// ---------------------------------------------------------------------------
// Perspectivas y pesos
// ---------------------------------------------------------------------------

/** Las cuatro del formato por cargo (columnas C..J de cada hoja). */
export const PERSPECTIVAS_FORMATO = [
  "autoevaluacion",
  "jefe_inmediato",
  "pares",
  "subordinados",
] as const;

export type PerspectivaFormato = (typeof PERSPECTIVAS_FORMATO)[number];

/**
 * Pesos del formato por cargo. En la hoja están dentro de cada fórmula
 * (D12*0.1, F12*0.4, H12*0.25, J12*0.25); en la base viven en
 * evaluacion_pesos. Este es el valor por defecto, por si la tabla no llega.
 */
export const PESO_DEFECTO: Record<PerspectivaFormato, number> = {
  autoevaluacion: 0.1,
  jefe_inmediato: 0.4,
  pares: 0.25,
  subordinados: 0.25,
};

export const ETIQUETA_PERSPECTIVA: Record<PerspectivaEvaluacion, string> = {
  autoevaluacion: "Autoevaluación",
  jefe_inmediato: "Jefe inmediato",
  pares: "Pares",
  subordinados: "Subordinados",
  alta_direccion: "Alta dirección",
};

// ---------------------------------------------------------------------------
// Escalas (son dos, y distintas: el libro las tiene así)
// ---------------------------------------------------------------------------

/** Fila 8 de cada hoja de cargo. */
export const ESCALA_FORMATO = [
  { valor: 1, etiqueta: "Deficiente" },
  { valor: 2, etiqueta: "Necesita mejorar" },
  { valor: 3, etiqueta: "Satisfactorio (cumple requerimientos)" },
  { valor: 4, etiqueta: "Sobresaliente" },
  { valor: 5, etiqueta: "Excelente (supera expectativas)" },
] as const;

/** Fila 3 de la hoja "Evaluaciones" (Likert de acuerdo/desacuerdo). */
export const ESCALA_360 = [
  { valor: 1, etiqueta: "Totalmente en desacuerdo" },
  { valor: 2, etiqueta: "En desacuerdo" },
  { valor: 3, etiqueta: "Neutro / aceptable" },
  { valor: 4, etiqueta: "De acuerdo" },
  { valor: 5, etiqueta: "Totalmente de acuerdo" },
] as const;

// ---------------------------------------------------------------------------
// Niveles: cada pantalla del Excel tiene su propia tabla de cortes
// ---------------------------------------------------------------------------

/** "Tabla de interpretación de resultados" de cada hoja de cargo (filas 29..32). */
export const TABLA_INTERPRETACION = [
  {
    desde: 4.5,
    hasta: 5,
    nivel: "Excelente / Sobresaliente",
    accion: "Candidato a plan de carrera / Bonificación",
  },
  {
    desde: 3.8,
    hasta: 4.49,
    nivel: "Satisfactorio Alto",
    accion: "Mantener desempeño y potenciar competencias",
  },
  {
    desde: 3,
    hasta: 3.79,
    nivel: "Satisfactorio Básico",
    accion: "Plan de acción preventivo en áreas débiles",
  },
  {
    desde: 1,
    hasta: 2.99,
    nivel: "No Satisfactorio",
    accion: "Plan de PIP (Performance Improvement Plan) obligatorio",
  },
] as const;

/** L24 de cada hoja de cargo. */
export function nivelFormato(nota: number | null | undefined): string | null {
  if (nota === null || nota === undefined) return null;
  if (nota >= 4.5) return "Excelente / Sobresaliente";
  if (nota >= 3.8) return "Satisfactorio Alto";
  if (nota >= 3) return "Satisfactorio Básico";
  return "No Satisfactorio";
}

/** Columna J del Dashboard. */
export function nivelDashboard(nota: number | null | undefined): string | null {
  if (nota === null || nota === undefined) return null;
  if (nota >= 4.5) return "Excepcional";
  if (nota >= 4) return "Sobresaliente";
  if (nota >= 3) return "Competente / Satisfactorio";
  if (nota >= 2) return "Necesita mejora";
  return "Insatisfactorio";
}

/** Columna K del Dashboard. */
export function estadoIso(nota: number | null | undefined): string | null {
  if (nota === null || nota === undefined) return null;
  return nota >= 3 ? "CONFORME" : "NO CONFORME · REQUIERE PAI";
}

/** Columna I de la hoja "Evaluaciones" (matriz 360). */
export function estatus360(promedio: number | null | undefined): string | null {
  if (promedio === null || promedio === undefined) return null;
  if (promedio >= 4.5) return "Excelente";
  if (promedio >= 4) return "Satisfactorio";
  if (promedio >= 3) return "En desarrollo";
  return "Plan de mejora";
}

/** "Nivel de dominio" por competencia en el Resumen General (D37..D40). */
export function nivelCompetencia(promedio: number | null | undefined): string | null {
  if (promedio === null || promedio === undefined) return null;
  if (promedio >= 4.5) return "Sobresaliente";
  if (promedio >= 4) return "Competente";
  if (promedio >= 3) return "En desarrollo";
  return "A mejorar";
}

/** Columna E del Resumen General por cargo (E12..E26). */
export function nivelCargoResumen(nota: number | null | undefined): string | null {
  if (nota === null || nota === undefined) return null;
  if (nota >= 4.5) return "Excelente";
  if (nota >= 3.8) return "Satisfactorio Alto";
  if (nota >= 3) return "En desarrollo";
  return "Plan de mejora";
}

/** E28 del Resumen y J22/K22 del Dashboard: el corte general es 3. */
export function conformidadGeneral(nota: number | null | undefined): {
  conforme: boolean;
  resumen: string;
  dashboard: string;
  iso: string;
} | null {
  if (nota === null || nota === undefined) return null;
  const conforme = nota >= 3;
  return {
    conforme,
    resumen: conforme ? "DESEMPEÑO CONFORME" : "DESEMPEÑO NO CONFORME",
    dashboard: conforme ? "ORGANIZACIÓN SALUDABLE" : "ALERTA OPERATIVA",
    iso: conforme ? "CONFORME GENERAL" : "REVISIÓN REQUERIDA",
  };
}

/** Color de la insignia según la nota, para no repetir el mismo if en cada tabla. */
export function varianteNota(
  nota: number | null | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  if (nota === null || nota === undefined) return "outline";
  if (nota >= 4) return "default";
  if (nota >= 3) return "secondary";
  return "destructive";
}

// ---------------------------------------------------------------------------
// Formato por cargo: la hoja, en una función
// ---------------------------------------------------------------------------

/** criterio_id → perspectiva → calificación (null o ausente = en blanco). */
export type MapaCalificaciones = Record<string, Partial<Record<PerspectivaFormato, number | null>>>;

export type ResultadoFormato = {
  /** K12..K23: suma de calificación × peso, con 0 donde está en blanco. */
  ponderadoPorCriterio: Record<string, number>;
  /** D24/F24/H24/J24: AVERAGE de la columna; null si no hay ninguna. */
  promedioPorPerspectiva: Record<PerspectivaFormato, number | null>;
  /** K24: AVERAGE(K12:K23). Null solo si no hay criterios. */
  notaFinal: number | null;
  nCalificadas: number;
  /** Perspectivas a las que les falta alguna calificación. */
  perspectivasIncompletas: PerspectivaFormato[];
};

/**
 * Replica la fila 24 y la columna K de una hoja de cargo.
 *
 * Fiel a la hoja incluso en lo discutible: una perspectiva sin calificar
 * aporta 0 al ponderado (IF(ISNUMBER(x), x*peso, 0)), así que la nota
 * final baja aunque lo calificado sea excelente. Por eso se devuelven las
 * perspectivas incompletas: la pantalla lo avisa en lugar de disimularlo.
 */
export function calcularFormato(
  criterioIds: readonly string[],
  calificaciones: MapaCalificaciones,
  pesos: Record<PerspectivaFormato, number> = PESO_DEFECTO,
): ResultadoFormato {
  const ponderadoPorCriterio: Record<string, number> = {};
  const suma: Record<PerspectivaFormato, number> = {
    autoevaluacion: 0,
    jefe_inmediato: 0,
    pares: 0,
    subordinados: 0,
  };
  const cuenta: Record<PerspectivaFormato, number> = { ...suma };
  let nCalificadas = 0;

  for (const id of criterioIds) {
    let ponderado = 0;
    for (const p of PERSPECTIVAS_FORMATO) {
      const v = calificaciones[id]?.[p];
      if (typeof v === "number" && Number.isFinite(v)) {
        ponderado += v * pesos[p];
        suma[p] += v;
        cuenta[p] += 1;
        nCalificadas += 1;
      }
    }
    ponderadoPorCriterio[id] = ponderado;
  }

  const promedioPorPerspectiva = {} as Record<PerspectivaFormato, number | null>;
  const perspectivasIncompletas: PerspectivaFormato[] = [];
  for (const p of PERSPECTIVAS_FORMATO) {
    promedioPorPerspectiva[p] = cuenta[p] > 0 ? suma[p] / cuenta[p] : null;
    if (cuenta[p] < criterioIds.length) perspectivasIncompletas.push(p);
  }

  const n = criterioIds.length;
  const notaFinal =
    n > 0 ? Object.values(ponderadoPorCriterio).reduce((a, b) => a + b, 0) / n : null;

  return { ponderadoPorCriterio, promedioPorPerspectiva, notaFinal, nCalificadas, perspectivasIncompletas };
}

// ---------------------------------------------------------------------------
// Matriz 360: la fila, en una función
// ---------------------------------------------------------------------------

export const COMPETENCIAS_360 = [
  { clave: "liderazgo", nombre: "Liderazgo y Gestión", preguntas: [0, 1, 2] },
  { clave: "trabajo_equipo", nombre: "Trabajo en Equipo y Comunicación", preguntas: [3, 4, 5] },
  { clave: "calidad_resultados", nombre: "Calidad y Orientación a Resultados", preguntas: [6, 7, 8] },
  { clave: "adaptabilidad", nombre: "Adaptabilidad e Innovación", preguntas: [9, 10, 11] },
] as const;

export type ClaveCompetencia = (typeof COMPETENCIAS_360)[number]["clave"];

/** H, J, K, L, M de la hoja "Evaluaciones" para una fila de 12 respuestas. */
export function calcular360(respuestas: readonly (number | null | undefined)[]): {
  promedio: number | null;
  competencias: Record<ClaveCompetencia, number | null>;
} {
  const media = (idx: readonly number[]) => {
    const v = idx
      .map((i) => respuestas[i])
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const competencias = {} as Record<ClaveCompetencia, number | null>;
  for (const c of COMPETENCIAS_360) competencias[c.clave] = media(c.preguntas);
  return { promedio: media([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), competencias };
}

// ---------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------

const formatoNota = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const formatoPorcentaje = new Intl.NumberFormat("es-CO", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatearNota(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? "—" : formatoNota.format(n);
}

/** "Cumplimiento": la nota sobre 5, como en el Resumen (D6 = B6/5). */
export function cumplimiento(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? "—" : formatoPorcentaje.format(n / 5);
}

/** "EVAL-001", como la columna A de la hoja "Evaluaciones". */
export function radicado360(consecutivo: number): string {
  return `EVAL-${String(consecutivo).padStart(3, "0")}`;
}

export const ETIQUETA_ESTADO_EVALUACION = {
  borrador: "Borrador",
  cerrada: "Cerrada",
} as const;

/** Media de una lista, ignorando nulos. Null si no queda nada (AVERAGE). */
export function media(valores: readonly (number | null | undefined)[]): number | null {
  const v = valores.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
