/**
 * PDA: etiquetas, columnas del formato FTM-SINF-005 y formato de
 * presentación. Los conteos (actividades hechas, evidencias, cumplimiento
 * promedio) viven en las vistas v_pda_*, para que la pantalla, el histórico
 * y el Excel exportado digan siempre lo mismo.
 */
import type { MimePda } from "./validaciones";
import type { ObjetivoPda } from "./supabase/tipos";

/** Cargos habituales del área; el campo admite cualquier otro. */
export const CARGOS_PDA = ["Líder de TI", "Soporte TI"] as const;

/**
 * Las 14 columnas de la matriz, en el orden del formato. `clave` es la
 * columna de `pda_objetivos`; `letra` la de la hoja de cálculo original.
 */
export const COLUMNAS_PDA = [
  { letra: "A", clave: "fecha_inicial", titulo: "FECHA INICIAL", ancho: 14 },
  { letra: "B", clave: "indicador", titulo: "INDICADOR", ancho: 42 },
  { letra: "C", clave: "indicador_anterior", titulo: "INDICADOR DEL MES ANTERIOR", ancho: 36 },
  { letra: "D", clave: "objetivo", titulo: "OBJETIVO (CUALITATIVO)", ancho: 48 },
  { letra: "E", clave: "causa_raiz", titulo: "ANÁLISIS CAUSA RAÍZ", ancho: 48 },
  { letra: "F", clave: "que_se_hara", titulo: "¿QUÉ SE HARÁ?", ancho: 48 },
  { letra: "G", clave: "como_se_hara", titulo: "¿CÓMO SE HARÁ?", ancho: 48 },
  { letra: "H", clave: "recursos", titulo: "¿CON QUÉ RECURSOS?", ancho: 36 },
  { letra: "I", clave: "periodicidad", titulo: "PERIODICIDAD", ancho: 32 },
  { letra: "J", clave: "responsable", titulo: "RESPONSABLE", ancho: 30 },
  { letra: "K", clave: "proyeccion", titulo: "PROYECCIÓN DE % CUMPLIMIENTO", ancho: 16 },
  { letra: "L", clave: "datos_cierre", titulo: "DATOS AL FINAL DE MES", ancho: 48 },
  { letra: "M", clave: "cumplimiento", titulo: "% CUMPLIMIENTO", ancho: 14 },
  { letra: "N", clave: "observacion", titulo: "OBSERVACIÓN", ancho: 48 },
] as const satisfies ReadonlyArray<{ letra: string; clave: keyof ObjetivoPda; titulo: string; ancho: number }>;

/** Estado de un objetivo según su columna M y si el mes está cerrado. */
export type EstadoObjetivo = "cumplido" | "parcial" | "no_cumplido" | "en_curso";

export function estadoObjetivo(cumplimiento: number | null | undefined): EstadoObjetivo {
  if (cumplimiento === null || cumplimiento === undefined) return "en_curso";
  const c = Number(cumplimiento);
  if (c >= 100) return "cumplido";
  if (c > 0) return "parcial";
  return "no_cumplido";
}

export const ETIQUETA_ESTADO_OBJETIVO: Record<EstadoObjetivo, string> = {
  cumplido: "Cumplido",
  parcial: "Cumplimiento parcial",
  no_cumplido: "No cumplido",
  en_curso: "En curso",
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

/** "2026-10-01" → "OCTUBRE" (para el nombre del archivo exportado). */
export function mesMayusculas(periodo: string): string {
  const m = Number(periodo.split("-")[1]);
  return (MESES[m - 1] ?? "").toUpperCase();
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

const formato = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

export function porcentaje(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return `${formato.format(Number(valor))} %`;
}

/** Ruta en el bucket `pda`: <plan_id>/<objetivo_id>/<archivo>. La exige el trigger de la base. */
export function rutaEvidenciaPda(planId: string, objetivoId: string, nombreArchivo: string): string {
  return `${planId}/${objetivoId}/${nombreArchivo}`;
}

/** MIME por extensión para el bucket `pda` (los navegadores móviles a veces no lo informan). */
export function mimeEvidenciaPorExtension(nombre: string): MimePda | null {
  const ext = nombre.slice(nombre.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return null;
  }
}

export const ACCEPT_EVIDENCIAS_PDA = ".png,.jpg,.jpeg,.webp,.pdf,.docx,.xlsx,.pptx";

/** Etiqueta corta del tipo de archivo: "PNG", "PDF", "Word"… */
export function tipoEvidencia(mime: string): string {
  if (mime.startsWith("image/")) return mime.slice(6).toUpperCase();
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("wordprocessingml")) return "Word";
  if (mime.includes("spreadsheetml")) return "Excel";
  if (mime.includes("presentationml")) return "PowerPoint";
  return "Archivo";
}
