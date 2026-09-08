import { exigirAdminApi } from "@/lib/api-admin";
import { respuestaError } from "@/lib/api-errores";
import { consultaAuditoria, ETIQUETA_ACCION, filtrosDesdeParams } from "@/lib/auditoria-consulta";
import { formatearFechaHora } from "@/lib/formato";

export const dynamic = "force-dynamic";

const LIMITE_EXPORT = 20_000;

function celda(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Exporta la auditoría filtrada como CSV (separador ";" y BOM UTF-8 para
 * que Excel en español lo abra en columnas). Usa el cliente de sesión:
 * RLS garantiza que solo el admin obtiene filas.
 */
export async function GET(req: Request) {
  const ctx = await exigirAdminApi();
  if (ctx.error) return ctx.error;

  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filtros = filtrosDesdeParams(sp);

  const { data, error } = await consultaAuditoria(ctx.supabase, filtros, { limite: LIMITE_EXPORT });
  if (error) return respuestaError(error.message, 500);

  const cabecera = ["Fecha", "Persona", "Correo", "Acción", "Documento", "Área", "IP", "Navegador", "ID documento"];
  const lineas = [cabecera.join(";")];
  for (const f of data ?? []) {
    lineas.push(
      [
        formatearFechaHora(f.ocurrio_en),
        f.usuario_nombre,
        f.usuario_email,
        ETIQUETA_ACCION[f.accion] ?? f.accion,
        f.doc_titulo,
        f.area_nombre,
        f.ip ?? "",
        f.user_agent ?? "",
        f.documento_id ?? "",
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
      "Content-Disposition": `attachment; filename="auditoria-${fecha}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
