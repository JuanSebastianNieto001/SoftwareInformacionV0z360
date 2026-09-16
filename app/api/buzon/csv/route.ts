import { exigirGestorBuzonApi } from "@/lib/api-admin";
import { respuestaError } from "@/lib/api-errores";
import { ETIQUETA_ESTADO, ETIQUETA_TIPO, etiquetaArea, radicado } from "@/lib/buzon";
import { formatearFecha, formatearFechaHora } from "@/lib/formato";

export const dynamic = "force-dynamic";

const LIMITE_EXPORT = 20_000;

function celda(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// En una hoja de calculo una celda vacia se filtra y se suma; un guion no.
const fechaCsv = (v: string | null) => (v ? formatearFecha(v) : "");
const fechaHoraCsv = (v: string | null) => (v ? formatearFechaHora(v) : "");

function eficacia(v: boolean | null): string {
  if (v === null) return "Sin verificar";
  return v ? "Eficaz" : "No eficaz";
}

/**
 * Exporta el buzón completo como CSV (separador ";" y BOM UTF-8, para que
 * Excel en español lo abra en columnas). Usa el cliente de sesión: RLS es
 * quien garantiza que solo el admin obtiene todas las filas.
 *
 * Cada fila lleva el ciclo entero —hecho, causa, acción, cierre y
 * eficacia— porque es lo que un auditor pide ver de una sentada.
 */
export async function GET() {
  const ctx = await exigirGestorBuzonApi();
  if (ctx.error) return ctx.error;

  const [{ data, error }, { data: personas }] = await Promise.all([
    ctx.supabase
      .from("sugerencias")
      .select("*")
      .order("consecutivo", { ascending: true })
      .limit(LIMITE_EXPORT),
    ctx.supabase.from("perfiles").select("id, nombre"),
  ]);

  if (error) return respuestaError(error.message, 500);

  const nombrePorId = new Map((personas ?? []).map((p) => [p.id, p.nombre]));

  const cabecera = [
    "Radicado",
    "Tipo",
    "Estado",
    "Área de quien reporta",
    "Ocurrió",
    "Recibido",
    "Quién",
    "Correo",
    "Qué ocurrió",
    "A quién afecta",
    "Propuesta del emisor",
    "Pidió respuesta",
    "Responsable",
    "Análisis de causa",
    "Acción tomada",
    "Fecha compromiso",
    "Cerrado",
    "Eficacia",
    "Cómo se verificó",
    "Respuesta al emisor",
    "Evidencia adjunta",
    "Evidencia subida el",
  ];

  const lineas = [cabecera.join(";")];
  for (const s of data ?? []) {
    lineas.push(
      [
        radicado(s.consecutivo),
        ETIQUETA_TIPO[s.tipo],
        ETIQUETA_ESTADO[s.estado],
        etiquetaArea(s.proceso),
        fechaCsv(s.ocurrido_en),
        fechaHoraCsv(s.creado_en),
        s.emisor_nombre,
        s.emisor_email,
        s.descripcion,
        s.impacto ?? "",
        s.propuesta ?? "",
        s.desea_respuesta ? "Sí" : "No",
        s.responsable_id ? (nombrePorId.get(s.responsable_id) ?? "") : "",
        s.analisis_causa ?? "",
        s.accion_tomada ?? "",
        fechaCsv(s.fecha_compromiso),
        fechaHoraCsv(s.cerrada_en),
        eficacia(s.eficacia_verificada),
        s.eficacia_nota ?? "",
        s.respuesta_emisor ?? "",
        s.evidencia_nombre ?? "",
        fechaHoraCsv(s.evidencia_subida_en),
      ]
        .map(celda)
        .join(";"),
    );
  }

  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${lineas.join("\r\n")}\r\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="buzon-${fecha}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
