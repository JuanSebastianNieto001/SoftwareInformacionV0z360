/**
 * Ranking de calidad del mes en curso, publicado para todo el personal.
 * Solo agregados (posición, promedio, auditorías, aprobadas) que entrega
 * ranking_calidad_mes(); el detalle de cada llamada sigue protegido.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Medal, Trophy } from "lucide-react";
import { EncabezadoPagina, EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatearPorcentaje, varianteNotaCalidad } from "@/lib/calidad";
import { exigirSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ranking de calidad" };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function mesActualBogota(): string {
  const [a, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit" }).format(new Date()).split("-").map(Number);
  const mes = MESES[(m ?? 1) - 1] ?? "";
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${a}`;
}

const PODIO = [
  { clase: "bg-amber-100 text-amber-900 border-amber-300", medalla: "text-amber-500", etiqueta: "1.er lugar" },
  { clase: "bg-slate-100 text-slate-900 border-slate-300", medalla: "text-slate-400", etiqueta: "2.º lugar" },
  { clase: "bg-orange-100 text-orange-900 border-orange-300", medalla: "text-orange-600", etiqueta: "3.er lugar" },
];

export default async function PaginaRanking({ searchParams }: PageProps<"/ranking">) {
  const sp = await searchParams;
  const tl = typeof sp.tl === "string" ? sp.tl : "";
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase.rpc("ranking_calidad_mes");
  const todos = data ?? [];
  const teamLeaders = [...new Set(todos.map((r) => r.team_leader).filter((t): t is string => !!t))].sort();
  const lista = tl ? todos.filter((r) => r.team_leader === tl) : todos;
  const yo = todos.find((r) => r.es_yo);
  const podio = todos.slice(0, 3);

  return (
    <>
      <EncabezadoPagina
        kicker="Calidad"
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            Ranking de asesores
            <Badge variant="secondary">{mesActualBogota()}</Badge>
          </span>
        }
        descripcion="Promedio de las auditorías de calidad publicadas en el mes en curso. Se reinicia cada mes."
      />

      {error ? (
        <EstadoVacio titulo="No se pudo cargar el ranking" descripcion={error.message} />
      ) : todos.length === 0 ? (
        <EstadoVacio icono={<Trophy />} titulo="Aún no hay auditorías publicadas este mes" descripcion="El ranking aparece en cuanto Calidad publique las primeras auditorías del mes." />
      ) : (
        <div className="space-y-6">
          {yo && (
            <div className="flex flex-wrap items-center gap-4 rounded-[20px] border border-primary/40 bg-tinte px-5 py-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground tabular-nums">
                #{yo.posicion}
              </span>
              <div className="min-w-0">
                <p className="font-semibold">Tu posición este mes</p>
                <p className="text-sm text-muted-foreground">
                  {formatearPorcentaje(Number(yo.promedio))} de promedio en {yo.auditorias} {yo.auditorias === 1 ? "auditoría" : "auditorías"} · puesto {yo.posicion} de {todos.length}
                </p>
              </div>
            </div>
          )}

          {/* Podio */}
          <section className="grid gap-3 sm:grid-cols-3">
            {podio.map((r, i) => {
              const p = PODIO[i] ?? PODIO[2];
              return (
                <div key={r.asesor_id} className={cn("flex items-center gap-3 rounded-[20px] border px-4 py-4", p.clase, r.es_yo && "ring-2 ring-primary")}>
                  <Medal className={cn("size-9 shrink-0", p.medalla)} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold tracking-[0.1em] uppercase opacity-70">{p.etiqueta}</p>
                    <p className="truncate font-semibold">{r.asesor_nombre}</p>
                    <p className="text-sm tabular-nums">
                      {formatearPorcentaje(Number(r.promedio))} · {r.auditorias} {r.auditorias === 1 ? "auditoría" : "auditorías"}
                    </p>
                  </div>
                </div>
              );
            })}
          </section>

          {/* Filtro por team leader */}
          {teamLeaders.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Equipo:</span>
              <Link
                href="/ranking"
                className={cn("rounded-full border px-3 py-1 text-[13px] font-medium", !tl ? "border-primary bg-primary text-primary-foreground" : "bg-card text-nav-inactivo hover:border-borde-acento hover:text-primary")}
              >
                Todos
              </Link>
              {teamLeaders.map((t) => (
                <Link
                  key={t}
                  href={`/ranking?${new URLSearchParams({ tl: t })}`}
                  className={cn("rounded-full border px-3 py-1 text-[13px] font-medium", tl === t ? "border-primary bg-primary text-primary-foreground" : "bg-card text-nav-inactivo hover:border-borde-acento hover:text-primary")}
                >
                  {t}
                </Link>
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-[20px] border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">#</TableHead>
                  <TableHead>Asesor</TableHead>
                  <TableHead>Team leader</TableHead>
                  <TableHead className="text-right">Auditorías</TableHead>
                  <TableHead className="text-right">Aprobadas</TableHead>
                  <TableHead className="text-right">Promedio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((r) => (
                  <TableRow key={r.asesor_id} className={cn(r.es_yo && "bg-tinte font-medium")}>
                    <TableCell className="tabular-nums text-muted-foreground">{r.posicion}</TableCell>
                    <TableCell>
                      {r.asesor_nombre}
                      {r.es_yo && (
                        <Badge variant="default" className="ml-2 align-middle text-[10px]">
                          tú
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{r.team_leader ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.auditorias}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.aprobadas}/{r.auditorias}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={varianteNotaCalidad(Number(r.promedio), 85)}>{formatearPorcentaje(Number(r.promedio))}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Empates en promedio se desempatan por número de auditorías. Una auditoría con error crítico cuenta con nota 0 %.
          </p>
        </div>
      )}
    </>
  );
}
