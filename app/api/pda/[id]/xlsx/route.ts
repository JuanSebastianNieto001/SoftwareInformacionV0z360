/**
 * Exporta un PDA al Excel que se entrega a la Gerencia, con la misma hoja
 * «PLAN DE ACCION» y las 14 columnas del formato FTM-SINF-005, más dos
 * hojas de soporte: la lista de chequeo y el índice de evidencias. RLS
 * decide si el PDA existe para quien lo pide; la descarga queda en la
 * auditoría.
 */
import ExcelJS from "exceljs";
import { registrarAcceso } from "@/lib/auditoria";
import { exigirModulo } from "@/lib/modulos-acceso";
import { COLUMNAS_PDA, mesMayusculas, nombreMes } from "@/lib/pda";
import { cargarPlanParaExcel } from "@/lib/pda/datos";
import type { ObjetivoPda } from "@/lib/supabase/tipos";

export const dynamic = "force-dynamic";

const MARINO = "FF1F3A5F";
const GRIS = "FFE8EDF4";

function fechaCorta(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function valorCelda(o: ObjetivoPda, clave: (typeof COLUMNAS_PDA)[number]["clave"]): string | number {
  const v = o[clave];
  if (clave === "fecha_inicial") return fechaCorta(v as string | null);
  if (clave === "proyeccion" || clave === "cumplimiento") {
    return v === null || v === undefined ? "" : Number(v) / 100;
  }
  return (v as string | null) ?? "";
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, perfil } = await exigirModulo("pda");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Identificador inválido.", { status: 400 });

  const datos = await cargarPlanParaExcel(supabase, id);
  if (!datos) return new Response("PDA no encontrado.", { status: 404 });
  const { plan, objetivos: lista, tareas, evidencias } = datos;
  const ids = new Set(lista.map((o) => o.id));
  const numero = new Map(lista.map((o, i) => [o.id, i + 1]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Comunícate con VOZ360";
  wb.created = new Date();

  // ---- Hoja 1: la matriz, igual que el formato ----
  const hoja = wb.addWorksheet("PLAN DE ACCION", { views: [{ state: "frozen", ySplit: 2 }] });
  hoja.columns = COLUMNAS_PDA.map((c) => ({ key: c.clave, width: c.ancho }));

  hoja.mergeCells(1, 1, 1, COLUMNAS_PDA.length);
  const titulo = hoja.getCell(1, 1);
  titulo.value = `${plan.codigo} · Versión ${plan.version} · PDA ${nombreMes(plan.periodo).toUpperCase()} · ${plan.cargo} · ${plan.responsable}`;
  titulo.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" }, name: "Arial" };
  titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MARINO } };
  titulo.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  hoja.getRow(1).height = 24;

  const cabecera = hoja.getRow(2);
  COLUMNAS_PDA.forEach((c, i) => {
    const celda = cabecera.getCell(i + 1);
    celda.value = c.titulo;
    celda.font = { bold: true, name: "Arial", size: 9 };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    celda.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    celda.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  cabecera.height = 36;

  for (const o of lista) {
    const fila = hoja.addRow(Object.fromEntries(COLUMNAS_PDA.map((c) => [c.clave, valorCelda(o, c.clave)])));
    fila.alignment = { vertical: "top", wrapText: true };
    fila.font = { name: "Arial", size: 9 };
    fila.getCell("proyeccion").numFmt = "0%";
    fila.getCell("cumplimiento").numFmt = "0%";
    fila.getCell("proyeccion").alignment = { vertical: "top", horizontal: "center" };
    fila.getCell("cumplimiento").alignment = { vertical: "top", horizontal: "center" };
    fila.eachCell({ includeEmpty: true }, (celda) => {
      celda.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });
  }

  if (lista.length) {
    const resumen = hoja.addRow([]);
    const primera = 3;
    const ultima = 2 + lista.length;
    resumen.getCell("responsable").value = "PROMEDIO";
    resumen.getCell("responsable").font = { bold: true, name: "Arial", size: 9 };
    resumen.getCell("proyeccion").value = { formula: `AVERAGE(K${primera}:K${ultima})` };
    resumen.getCell("cumplimiento").value = { formula: `IFERROR(AVERAGE(M${primera}:M${ultima}),"")` };
    resumen.getCell("proyeccion").numFmt = "0.0%";
    resumen.getCell("cumplimiento").numFmt = "0.0%";
    resumen.getCell("proyeccion").font = { bold: true, name: "Arial", size: 9 };
    resumen.getCell("cumplimiento").font = { bold: true, name: "Arial", size: 9 };
  }

  // ---- Hoja 2: lista de chequeo ----
  const chequeo = wb.addWorksheet("LISTA DE CHEQUEO");
  chequeo.columns = [
    { header: "N.º", key: "n", width: 6 },
    { header: "Objetivo (indicador)", key: "indicador", width: 50 },
    { header: "Actividad", key: "descripcion", width: 60 },
    { header: "Fecha límite", key: "fecha", width: 14 },
    { header: "Completada", key: "completada", width: 12 },
    { header: "Fecha de cierre", key: "cierre", width: 18 },
    { header: "Observación", key: "observacion", width: 40 },
  ];
  chequeo.getRow(1).font = { bold: true, name: "Arial", size: 9 };
  chequeo.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
  for (const t of tareas.filter((t) => ids.has(t.objetivo_id))) {
    const o = lista.find((x) => x.id === t.objetivo_id);
    chequeo
      .addRow({
        n: numero.get(t.objetivo_id) ?? "",
        indicador: o?.indicador ?? "",
        descripcion: t.descripcion,
        fecha: fechaCorta(t.fecha_limite),
        completada: t.completada ? "Sí" : "No",
        cierre: t.completada_en ? new Date(t.completada_en).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "",
        observacion: t.observacion ?? "",
      })
      .font = { name: "Arial", size: 9 };
  }
  const hechas = tareas.filter((t) => ids.has(t.objetivo_id) && t.completada).length;
  const total = tareas.filter((t) => ids.has(t.objetivo_id)).length;
  if (total) {
    const r = chequeo.addRow({ descripcion: `CUMPLIMIENTO DE ACTIVIDADES: ${hechas} de ${total} (${Math.round((100 * hechas) / total)} %)` });
    r.font = { bold: true, name: "Arial", size: 9 };
  }

  // ---- Hoja 3: índice de evidencias ----
  const idx = wb.addWorksheet("EVIDENCIAS");
  idx.columns = [
    { header: "N.º", key: "n", width: 6 },
    { header: "Objetivo (indicador)", key: "indicador", width: 50 },
    { header: "Archivo", key: "archivo", width: 46 },
    { header: "Tipo", key: "mime", width: 14 },
    { header: "Descripción", key: "descripcion", width: 50 },
    { header: "Subida", key: "fecha", width: 18 },
  ];
  idx.getRow(1).font = { bold: true, name: "Arial", size: 9 };
  idx.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
  for (const e of evidencias.filter((e) => ids.has(e.objetivo_id))) {
    const o = lista.find((x) => x.id === e.objetivo_id);
    idx
      .addRow({
        n: numero.get(e.objetivo_id) ?? "",
        indicador: o?.indicador ?? "",
        archivo: e.nombre_archivo,
        mime: e.mime.split("/").pop()?.split(".").pop()?.toUpperCase() ?? "",
        descripcion: e.descripcion ?? "",
        fecha: new Date(e.creado_en).toLocaleString("es-CO", { timeZone: "America/Bogota" }),
      })
      .font = { name: "Arial", size: 9 };
  }
  idx.addRow([]);
  idx.addRow({ indicador: "Los archivos se abren desde la aplicación (Comunícate con VOZ360 → PDA), con la sesión de quien tiene acceso al cuadro." }).font = {
    italic: true,
    name: "Arial",
    size: 9,
  };

  await registrarAcceso(supabase, user, {
    accion: "descargar",
    documento: { id: null, titulo: `PDA ${nombreMes(plan.periodo)} · ${plan.cargo} (Excel)`, area_nombre: "PDA" },
    perfilNombre: perfil.nombre,
    request: _req,
  });

  const buffer = await wb.xlsx.writeBuffer();
  const nombre = `PDA_${mesMayusculas(plan.periodo)}_${plan.periodo.slice(0, 4)}_-_${plan.cargo.replace(/\s+/g, "_")}.xlsx`;
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre.normalize("NFD").replace(/[̀-ͯ]/g, "")}"`,
      "Cache-Control": "no-store, private",
    },
  });
}
