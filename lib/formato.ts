/**
 * Utilidades de presentación (fechas, tamaños, textos). Sin lógica de
 * seguridad. Zona horaria fija: la empresa opera en Colombia.
 */

export const ZONA_HORARIA = "America/Bogota";
const LOCALE = "es-CO";

export function formatearFecha(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const fecha = typeof valor === "string" ? new Date(valor) : valor;
  if (Number.isNaN(fecha.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeZone: ZONA_HORARIA,
  }).format(fecha);
}

export function formatearFechaHora(
  valor: string | Date | null | undefined,
): string {
  if (!valor) return "—";
  const fecha = typeof valor === "string" ? new Date(valor) : valor;
  if (Number.isNaN(fecha.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ZONA_HORARIA,
  }).format(fecha);
}

export function formatearBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ["KB", "MB", "GB"];
  let valor = bytes / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  return `${valor.toFixed(valor >= 100 ? 0 : 1)} ${unidades[i]}`;
}

/** Días (redondeando hacia arriba) entre ahora y la fecha dada; negativo si ya pasó. */
export function diasHasta(valor: string | Date | null | undefined): number | null {
  if (!valor) return null;
  const fecha = typeof valor === "string" ? new Date(valor) : valor;
  if (Number.isNaN(fecha.getTime())) return null;
  return Math.ceil((fecha.getTime() - Date.now()) / 86_400_000);
}

/** Texto relativo corto: "Vence en 3 días", "Venció hace 2 días", etc. */
export function describirVencimiento(vigenteHasta: string | null): string {
  if (!vigenteHasta) return "Sin vencimiento";
  const dias = diasHasta(vigenteHasta);
  if (dias === null) return "—";
  if (dias < 0) {
    const n = Math.abs(dias);
    return `Venció hace ${n} ${n === 1 ? "día" : "días"}`;
  }
  if (dias === 0) return "Vence hoy";
  if (dias === 1) return "Vence mañana";
  return `Vence en ${dias} días`;
}

/** "YYYY-MM-DD" (input type=date) → ISO al inicio del día en Bogotá (UTC-5). */
export function inicioDeDiaIso(fecha: string): string {
  return `${fecha}T00:00:00-05:00`;
}

/** "YYYY-MM-DD" → ISO al final del día en Bogotá (UTC-5). */
export function finDeDiaIso(fecha: string): string {
  return `${fecha}T23:59:59-05:00`;
}

/** Fecha de hoy en Bogotá como "YYYY-MM-DD". */
export function hoyIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Suma días y/o meses a "YYYY-MM-DD" y devuelve "YYYY-MM-DD". */
export function sumarADia(
  fecha: string,
  opciones: { dias?: number; meses?: number },
): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  if (opciones.meses) base.setUTCMonth(base.getUTCMonth() + opciones.meses);
  if (opciones.dias) base.setUTCDate(base.getUTCDate() + opciones.dias);
  return base.toISOString().slice(0, 10);
}

/** ISO → "YYYY-MM-DD" en Bogotá (para rellenar inputs type=date). */
export function isoADia(valor: string | null | undefined): string {
  if (!valor) return "";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function plural(n: number, singular: string, pluralTxt: string): string {
  return `${n} ${n === 1 ? singular : pluralTxt}`;
}

/** ISO de "ahora + N días" (para filtros de vencimiento próximo). */
export function isoDentroDe(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString();
}
