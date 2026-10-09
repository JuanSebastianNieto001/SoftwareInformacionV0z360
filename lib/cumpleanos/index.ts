/**
 * Cumpleaños: etiquetas y pequeñas utilidades de presentación. Lo que
 * decide fechas (próxima ocurrencia, días que faltan, edad) está en la
 * vista v_cumpleanos, para que la pantalla y las alertas digan lo mismo.
 */

export const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** "14 de octubre" */
export function diaMes(dia: number, mes: number): string {
  return `${dia} de ${MESES[mes - 1] ?? "?"}`;
}

/** "Hoy", "Mañana", "En 3 días", "En 2 meses" */
export function enCuanto(dias: number): string {
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Mañana";
  if (dias < 31) return `En ${dias} días`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? "En un mes" : `En ${meses} meses`;
}

/** Etiqueta del grupo cuando no hay team leader. */
export const GRUPO_ESTRUCTURA = "Estructura";

/** Normaliza un nombre para comparar: sin acentos, sin dobles espacios, minúsculas. */
export function nombreComparable(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
