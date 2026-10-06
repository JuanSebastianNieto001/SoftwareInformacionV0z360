/**
 * Exporta las auditorías de calidad a CSV con los mismos filtros de la
 * pantalla. RLS decide qué filas salen: sin acceso al cuadro, el archivo
 * va vacío. Queda en la auditoría como descarga.
 */
import { headers } from "next/headers";
import { registrarAcceso } from "@/lib/auditoria";
import { respuestaError } from "@/lib/api-errores";
import { exigirModulo } from "@/lib/modulos-acceso";

export const dynamic = "force-dynamic";

const campo = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const { supabase, user, perfil } = await exigirModulo("calidad");
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const tl = sp.get("tl") ?? "";
  const estado = sp.get("estado") ?? "";
  const desde = sp.get("desde") ?? "";
  const hasta = sp.get("hasta") ?? "";

  let consulta = supabase
    .from("v_calidad_evaluaciones")
    .select("fecha_auditoria, fecha_interaccion, asesor_nombre, team_leader, analista_nombre, tipo, etapa, canal, duracion, referencia, estado, nota_sin_ic, nota_final, aprobada, n_no_cumple, n_fatales_fallados, retro_estado, puntos_mejora")
    .order("fecha_auditoria", { ascending: false })
    .limit(5000);
  if (q) consulta = consulta.ilike("asesor_nombre", `%${q}%`);
  if (tl) consulta = consulta.eq("team_leader", tl);
  if (estado === "borrador" || estado === "publicada") consulta = consulta.eq("estado", estado);
  if (desde) consulta = consulta.gte("fecha_auditoria", desde);
  if (hasta) consulta = consulta.lte("fecha_auditoria", hasta);
  const { data, error } = await consulta;
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
