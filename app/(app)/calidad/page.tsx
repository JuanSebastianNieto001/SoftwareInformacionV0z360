/**
 * Dashboard de calidad: lo que el informe gerencial sacaba a mano de las
 * hojas de cálculo. Promedio y aprobación del periodo, ranking de asesores,
 * fallas más recurrentes y el estado de retroalimentaciones y compromisos.
 * Filtros por mes y team leader.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatearPorcentaje, varianteNotaCalidad } from "@/lib/calidad";
import { media } from "@/lib/evaluacion";
import { hoyIso } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos-acceso";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calidad" };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaMes = (ym: string) => {
  const [a, m] = ym.split("-").map(Number);
  return `${MESES[(m ?? 1) - 1]} ${a}`;
};

export default async function PaginaDashboardCalidad({ searchParams }: PageProps<"/calidad">) {
  const sp = await searchParams;
  const { supabase, puedeEditar } = await exigirModulo("calidad");
  const hoy = hoyIso();
  const mesActual = hoy.slice(0, 7);
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesActual;
  const todos = sp.mes === "todos";
  const tl = typeof sp.tl === "string" ? sp.tl : "";

  // Últimos seis meses como pastillas.
  const meses: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(Number(mesActual.slice(0, 4)), Number(mesActual.slice(5, 7)) - 1 - i, 1));
    meses.push(d.toISOString().slice(0, 7));
  }

  let consulta = supabase
    .from("v_calidad_evaluaciones")
    .select("id, asesor_id, asesor_nombre, team_leader, nota_final, nota_sin_ic, nota_minima, aprobada, n_fatales_fallados, retro_estado, canal, tipo")
    .eq("estado", "publicada")
    .limit(5000);
  // Rango [día 1, día 1 del mes siguiente): "-31" era una fecha inválida en
  // los meses de 30 días y la consulta entera fallaba (septiembre vacío).
  const inicioSiguiente = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1)).toISOString().slice(0, 10);
  if (!todos) consulta = consulta.gte("fecha_auditoria", `${mes}-01`).lt("fecha_auditoria", inicioSiguiente);
  if (tl) consulta = consulta.eq("team_leader", tl);

  const [{ data: evals }, { data: tls }, { data: items }] = await Promise.all([
    consulta,
    supabase.from("calidad_asesores").select("team_leader").not("team_leader", "is", null),
    supabase.from("calidad_items").select("id, categoria, descripcion, es_fatal").eq("activo", true),
  ]);
  const lista = evals ?? [];
  // Las fallas se filtran con un join embebido (mismos filtros del periodo):
  // pasar cientos de ids por la URL rompía la petición con «mes: todo». El
  // servidor corta cada respuesta en 1000 filas, así que se pagina.
  const fallas: { item_id: string }[] = [];
  for (let pagina = 0; pagina < 20; pagina++) {
    let consultaFallas = supabase
      .from("calidad_respuestas")
      .select("item_id, calidad_evaluaciones!inner(id)")
      .eq("resultado", "no_cumple")
      .eq("calidad_evaluaciones.estado", "publicada")
      .range(pagina * 1000, pagina * 1000 + 999);
    if (!todos) consultaFallas = consultaFallas.gte("calidad_evaluaciones.fecha_auditoria", `${mes}-01`).lt("calidad_evaluaciones.fecha_auditoria", inicioSiguiente);
    if (tl) consultaFallas = consultaFallas.eq("calidad_evaluaciones.team_leader", tl);
    const { data: tramo } = await consultaFallas.returns<{ item_id: string }[]>();
    fallas.push(...(tramo ?? []));
    if (!tramo || tramo.length < 1000) break;
  }
  const { data: compromisos } = await supabase.from("calidad_compromisos").select("estado, fecha_limite").limit(5000);

  const teamLeaders = [...new Set((tls ?? []).map((t) => t.team_leader as string))].sort();
  const notas = lista.map((e) => (e.nota_final === null ? null : Number(e.nota_final)));
  const promedio = media(notas);
  // Calidad operativa: promedia la nota sin anular por crítico (el "desempeño neto de proceso" del informe gerencial).
  const promedioOperativo = media(lista.map((e) => (e.nota_sin_ic === null ? null : Number(e.nota_sin_ic))));
  const aprobadas = lista.filter((e) => e.aprobada === true).length;
  const conCritico = lista.filter((e) => Number(e.n_fatales_fallados) > 0).length;
  const pctCritico = lista.length ? Math.round((conCritico / lista.length) * 100) : 0;
  const conRetro = lista.filter((e) => e.retro_estado).length;
  const firmadas = lista.filter((e) => e.retro_estado === "firmada").length;

  // Ranking por asesor
  const porAsesor = new Map<string, { nombre: string; tl: string | null; notas: number[]; aprobadas: number }>();
  for (const e of lista) {
    const k = e.asesor_id;
    const r = porAsesor.get(k) ?? { nombre: e.asesor_nombre, tl: e.team_leader, notas: [], aprobadas: 0 };
    if (e.nota_final !== null) r.notas.push(Number(e.nota_final));
    if (e.aprobada) r.aprobadas += 1;
    porAsesor.set(k, r);
  }
  const ranking = [...porAsesor.values()]
    .map((r) => ({ ...r, promedio: media(r.notas), n: r.notas.length }))
    .filter((r) => r.n > 0)
    .sort((a, b) => (b.promedio ?? 0) - (a.promedio ?? 0) || b.n - a.n);

  // Fallas recurrentes
  const cuenta = new Map<string, number>();
  for (const f of fallas ?? []) cuenta.set(f.item_id, (cuenta.get(f.item_id) ?? 0) + 1);
  const fallasTop = (items ?? [])
    .map((i) => ({ ...i, n: cuenta.get(i.id) ?? 0 }))
    .filter((i) => i.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);

  const comp = compromisos ?? [];
  const compPend = comp.filter((c) => c.estado === "pendiente" || c.estado === "en_seguimiento");
  const compVenc = compPend.filter((c) => c.fecha_limite < hoy).length;
  const compCumpl = comp.filter((c) => c.estado === "cumplido").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Mes:</span>
        {meses.map((m) => (
          <Link
            key={m}
            href={`/calidad?${new URLSearchParams({ ...(m !== mesActual ? { mes: m } : {}), ...(tl ? { tl } : {}) })}`}
            className={cn(
              "rounded-full border px-3 py-1 text-[13px] font-medium",
              !todos && m === mes ? "border-primary bg-primary text-primary-foreground" : "bg-card text-nav-inactivo hover:border-borde-acento hover:text-primary",
            )}
          >
            {etiquetaMes(m)}
          </Link>
        ))}
        <Link
          href={`/calidad?${new URLSearchParams({ mes: "todos", ...(tl ? { tl } : {}) })}`}
          className={cn("rounded-full border px-3 py-1 text-[13px] font-medium", todos ? "border-primary bg-primary text-primary-foreground" : "bg-card text-nav-inactivo hover:border-borde-acento hover:text-primary")}
        >
          Todo
        </Link>
        <form method="get" action="/calidad" className="ml-auto flex items-center gap-2">
          {!todos && mes !== mesActual && <input type="hidden" name="mes" value={mes} />}
          {todos && <input type="hidden" name="mes" value="todos" />}
          <select name="tl" defaultValue={tl} className="h-[36px] rounded-lg border-[1.5px] border-input bg-campo px-2 text-sm" aria-label="Team leader">
            <option value="">Todos los team leaders</option>
            {teamLeaders.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="sm">
            Filtrar
          </Button>
          {puedeEditar && (
            <Button asChild size="sm">
              <Link href="/calidad/evaluaciones/nueva">
                <ClipboardList /> Nueva auditoría
              </Link>
            </Button>
          )}
        </form>
      </div>

      {lista.length === 0 && (
        <EstadoVacio icono={<ClipboardList />} titulo={todos ? "Todavía no hay auditorías publicadas" : `Sin auditorías publicadas en ${etiquetaMes(mes)}`} descripcion="El dashboard se calcula solo con lo que se publique." />
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Indicador etiqueta="Calidad con IC" valor={formatearPorcentaje(promedio)} detalle={`${lista.length} ${lista.length === 1 ? "auditoría" : "auditorías"} · anula si falla un crítico`} />
        <Indicador etiqueta="Calidad operativa (sin IC)" valor={formatearPorcentaje(promedioOperativo)} detalle="Desempeño del proceso, sin anular por crítico" />
        <Indicador etiqueta="Con error crítico" valor={lista.length ? `${pctCritico} %` : "—"} detalle={`${conCritico} de ${lista.length} ${conCritico === 1 ? "auditoría" : "auditorías"}`} tono={conCritico > 0 ? "alerta" : "neutro"} />
        <Indicador etiqueta="Aprobadas" valor={lista.length ? `${Math.round((aprobadas / lista.length) * 100)} %` : "—"} detalle={`${aprobadas} de ${lista.length}`} tono={lista.length && aprobadas / lista.length >= 0.8 ? "bien" : lista.length ? "alerta" : "neutro"} />
        <Indicador etiqueta="Con retroalimentación" valor={lista.length ? `${Math.round((conRetro / lista.length) * 100)} %` : "—"} detalle={`${firmadas} firmadas de ${conRetro}`} />
        <Indicador etiqueta="Compromisos abiertos" valor={String(compPend.length)} detalle={`${compVenc} vencidos · ${compCumpl} cumplidos en total`} tono={compVenc > 0 ? "alerta" : "neutro"} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          <h2 className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">Ranking de asesores</h2>
          <div className="overflow-x-auto rounded-[20px] border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Asesor</TableHead>
                  <TableHead>Team leader</TableHead>
                  <TableHead className="text-right">Auditorías</TableHead>
                  <TableHead className="text-right">Promedio</TableHead>
                  <TableHead className="text-right">Aprobadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      Sin datos en el periodo.
                    </TableCell>
                  </TableRow>
                )}
                {ranking.map((r, i) => (
                  <TableRow key={r.nombre + i}>
                    <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/calidad/evaluaciones?q=${encodeURIComponent(r.nombre)}`} className="hover:text-primary hover:underline">
                        {r.nombre}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">{r.tl ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.n}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={varianteNotaCalidad(r.promedio, Number(lista[0]?.nota_minima ?? 85))}>{formatearPorcentaje(r.promedio)}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.aprobadas}/{r.n}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">Fallas más recurrentes</h2>
          <div className="rounded-[20px] border bg-card p-4">
            {fallasTop.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin «no cumple» en el periodo.</p>
            ) : (
              <ul className="space-y-2">
                {fallasTop.map((f) => {
                  const pct = lista.length ? Math.round((f.n / lista.length) * 100) : 0;
                  return (
                    <li key={f.id} className="text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 leading-snug">
                          <span className="text-xs text-muted-foreground">{f.categoria} · </span>
                          {f.descripcion}
                          {f.es_fatal && (
                            <Badge variant="destructive" className="ml-1 align-middle">
                              crítico
                            </Badge>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {f.n} · {pct} %
                        </span>
                      </div>
                      <span className="mt-1 block h-1.5 rounded-full bg-muted">
                        <span className={cn("block h-1.5 rounded-full", f.es_fatal ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, pct)}%` }} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Indicador({ etiqueta, valor, detalle, tono = "neutro" }: { etiqueta: string; valor: string; detalle?: string; tono?: "neutro" | "bien" | "alerta" }) {
  return (
    <Card className="rounded-[20px]">
      <CardContent className="px-[18px] py-4">
        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{etiqueta}</p>
        <p className={cn("mt-1 text-[26px] leading-tight font-semibold tabular-nums", tono === "bien" && "text-emerald-700", tono === "alerta" && "text-destructive")}>{valor}</p>
        {detalle && <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>}
      </CardContent>
    </Card>
  );
}
