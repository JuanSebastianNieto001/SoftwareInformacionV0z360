/**
 * Exporta las auditorías de calidad a CSV con los mismos filtros de la
 * pantalla. RLS decide qué filas salen: sin acceso al cuadro, el archivo
 * va vacío. Queda en la auditoría como descarga.
 */
import { headers } from "next/headers";
import { registrarAcceso } from "@/lib/auditoria";
import { respuestaError } from "@/lib/api/errores";
import { exigirCalidad } from "@/lib/calidad/acceso";
import { listarAuditoriasParaCsv } from "@/lib/calidad/datos";

export const dynamic = "force-dynamic";

const campo = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const { supabase, user, perfil } = await exigirCalidad();
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const tl = sp.get("tl") ?? "";
  const estado = sp.get("estado") ?? "";
  const desde = sp.get("desde") ?? "";
  const hasta = sp.get("hasta") ?? "";

  const { data, error } = await listarAuditoriasParaCsv(supabase, { q, tl, estado, desde, hasta });
  if (error) return respuestaError(error.message, 500);

  await registrarAcceso(supabase, user, {
    accion: "descargar",
    documento: { id: null, titulo: `CSV de auditorías de calidad (${data?.length ?? 0} filas)`, area_nombre: "Calidad" },
    perfilNombre: perfil.nombre,
    request: { headers: await headers() },
  });

  const cab = ["fecha_auditoria", "fecha_interaccion", "asesor", "team_leader", "analista", "tipo", "etapa", "canal", "duracion", "referencia", "estado", "nota_sin_ic", "nota_final", "aprobada", "no_cumple", "criticos_fallados", "retroalimentacion", "puntos_mejora"];
  const filas = (data ?? []).map((r) =>
    [r.fecha_auditoria, r.fecha_interaccion, r.asesor_nombre, r.team_leader, r.analista_nombre, r.tipo, r.etapa, r.canal, r.duracion, r.referencia, r.estado, r.nota_sin_ic, r.nota_final, r.aprobada === null ? "" : r.aprobada ? "sí" : "no", r.n_no_cumple, r.n_fatales_fallados, r.retro_estado ?? "", r.puntos_mejora]
      .map(campo)
      .join(";"),
  );
  // BOM para que Excel abra el UTF-8 con tildes bien; punto y coma porque la
  // configuración regional colombiana usa coma decimal.
  const csv = "﻿" + [cab.join(";"), ...filas].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="auditorias-calidad-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
