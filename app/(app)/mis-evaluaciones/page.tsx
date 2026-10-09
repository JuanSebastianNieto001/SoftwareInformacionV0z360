/**
 * Lo que un asesor ve de calidad: sus auditorías publicadas con los ítems
 * que no cumplió y la retroalimentación con sus compromisos, que firma
 * desde aquí. No hace falta tener el cuadro de Calidad: RLS entrega solo lo
 * propio, y la página además filtra por la fila de la estructura de quien
 * entra, para que quien sí tiene el cuadro no vea aquí a todo el mundo.
 */
import type { Metadata } from "next";
import { AlertTriangle, BadgeCheck, CalendarClock, CheckCircle2, CircleAlert, Lightbulb, MessageSquareQuote, PenLine, ThumbsUp } from "lucide-react";
import { FirmaRetro } from "@/components/calidad/firma-retro";
import { EncabezadoPagina, EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { ETIQUETA_ESTADO_COMPROMISO, ETIQUETA_ESTADO_RETRO, formatearPorcentaje } from "@/lib/calidad";
import { cargarMisEvaluaciones } from "@/lib/calidad/datos";
import { formatearFecha, formatearFechaHora } from "@/lib/formato";
import { exigirSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mis evaluaciones de calidad" };

export default async function PaginaMisEvaluaciones() {
  const { supabase, user } = await exigirSesion();

  const { yo, evals, fallas, items, retros, compromisos } = await cargarMisEvaluaciones(supabase, user.id);
  const lista = evals ?? [];
  const itemPorId = new Map((items ?? []).map((i) => [i.id, i]));

  return (
    <>
      <EncabezadoPagina kicker="Calidad" titulo="Mis evaluaciones" descripcion={yo ? `${yo.nombre}${yo.team_leader ? ` · Team leader: ${yo.team_leader}` : ""}` : "Tus auditorías de calidad y las retroalimentaciones que te hagan."} />

      {!yo || lista.length === 0 ? (
        <EstadoVacio icono={<BadgeCheck />} titulo="Todavía no tienes evaluaciones publicadas" descripcion={yo ? "Cuando Calidad publique una auditoría tuya la verás aquí y recibirás un aviso." : "Tu cuenta no está vinculada a la estructura operativa. Si eres asesor, pide a Calidad que la vincule."} />
      ) : (
        <ul className="space-y-6">
          {lista.map((e) => {
            const nota = e.nota_final === null ? null : Number(e.nota_final);
            const conCritico = Number(e.n_fatales_fallados) > 0;
            const misFallas = (fallas ?? []).filter((f) => f.evaluacion_id === e.id);
            const retro = (retros ?? []).find((r) => r.evaluacion_id === e.id) ?? null;
            const comp = retro ? (compromisos ?? []).filter((c) => c.retro_id === retro.id) : [];
            return (
              <li key={e.id} className="overflow-hidden rounded-[24px] border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                {/* Cabecera: nota y veredicto */}
                <div className={cn("flex flex-wrap items-center justify-between gap-4 px-6 py-5 text-white", e.aprobada ? "bg-emerald-700" : "bg-marino")}>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-[0.12em] text-white/70 uppercase">
                      {e.tipo}
                      {e.etapa ? ` · ${e.etapa}` : ""}
                    </p>
                    <p className="mt-1 text-[17px] leading-snug font-semibold">Interacción del {formatearFecha(e.fecha_interaccion)}</p>
                    <p className="mt-0.5 text-sm text-white/80">
                      Auditada el {formatearFecha(e.fecha_auditoria)} por {e.analista_nombre}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[38px] leading-none font-semibold tabular-nums">{formatearPorcentaje(nota)}</p>
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
                      {e.aprobada ? <CheckCircle2 className="size-3.5" aria-hidden /> : <AlertTriangle className="size-3.5" aria-hidden />}
                      {e.aprobada ? "Aprobada" : "No aprobada"}
                      {conCritico ? " · error crítico" : ""}
                    </span>
                  </div>
                </div>

                <div className="space-y-5 p-5 sm:p-6">
                  {e.puntos_mejora && (
                    <div className="rounded-[18px] bg-zona/60 p-4">
                      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">
                        <Lightbulb className="size-3.5" aria-hidden /> Puntos de mejora
                      </p>
                      <p className="mt-1.5 text-sm whitespace-pre-line">{e.puntos_mejora}</p>
                    </div>
                  )}

                  {misFallas.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">Ítems por mejorar · {misFallas.length}</p>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {misFallas.map((f) => {
                          const it = itemPorId.get(f.item_id);
                          return (
                            <li
                              key={f.item_id}
                              className={cn("flex items-start gap-2.5 rounded-[14px] border px-3 py-2.5", it?.es_fatal ? "border-destructive/40 bg-destructive/5" : "bg-card")}
                            >
                              {it?.es_fatal ? (
                                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                              ) : (
                                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                              )}
                              <span className="min-w-0">
                                <span className="block text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                                  {it?.categoria}
                                  {it?.es_fatal && <span className="ml-1 text-destructive">· crítico</span>}
                                </span>
                                <span className="block text-sm leading-snug">{it?.descripcion ?? "Ítem"}</span>
                                {f.hallazgo && <span className="mt-0.5 block text-xs text-muted-foreground">{f.hallazgo}</span>}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* Retroalimentación */}
                  <div className="overflow-hidden rounded-[18px] border">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-zona/60 px-4 py-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">
                        <MessageSquareQuote className="size-3.5" aria-hidden /> Retroalimentación
                      </p>
                      {retro && (
                        <Badge variant={retro.estado === "firmada" ? "default" : "secondary"}>
                          {retro.estado === "firmada" && <CheckCircle2 className="mr-1 size-3" />}
                          {ETIQUETA_ESTADO_RETRO[retro.estado]}
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-3 p-4">
                      {!retro ? (
                        <p className="text-sm text-muted-foreground">Aún no se ha hecho la sesión de retroalimentación de esta auditoría.</p>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground">Sesión con {retro.realizada_por_nombre}</p>
                          {(retro.fortalezas || retro.oportunidades) && (
                            <div className="grid gap-3 md:grid-cols-2">
                              {retro.fortalezas && (
                                <div className="rounded-[14px] border border-emerald-200 bg-emerald-50/60 p-3">
                                  <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.1em] text-emerald-800 uppercase">
                                    <ThumbsUp className="size-3.5" aria-hidden /> Fortalezas
                                  </p>
                                  <p className="mt-1 text-sm whitespace-pre-line">{retro.fortalezas}</p>
                                </div>
                              )}
                              {retro.oportunidades && (
                                <div className="rounded-[14px] border border-amber-200 bg-amber-50/60 p-3">
                                  <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.1em] text-amber-800 uppercase">
                                    <Lightbulb className="size-3.5" aria-hidden /> Oportunidades
                                  </p>
                                  <p className="mt-1 text-sm whitespace-pre-line">{retro.oportunidades}</p>
                                </div>
                              )}
                            </div>
                          )}
                          {comp.length > 0 && (
                            <ul className="space-y-2">
                              {comp.map((c) => (
                                <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-[14px] bg-tinte px-3 py-2.5">
                                  <CalendarClock className="size-4 shrink-0 text-primary" aria-hidden />
                                  <span className="min-w-0 flex-1 text-sm">{c.descripcion}</span>
                                  <span className="text-xs text-muted-foreground">límite {formatearFecha(c.fecha_limite)}</span>
                                  <Badge variant="outline" className="text-[11px]">
                                    {ETIQUETA_ESTADO_COMPROMISO[c.estado]}
                                  </Badge>
                                </li>
                              ))}
                            </ul>
                          )}
                          {retro.estado === "firmada" ? (
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <PenLine className="size-3.5" aria-hidden />
                              Firmaste el {formatearFechaHora(retro.firmada_en ?? retro.actualizado_en)}.{retro.comentarios_asesor ? ` Tu comentario: «${retro.comentarios_asesor}»` : ""}
                            </p>
                          ) : retro.estado === "en_proceso" ? (
                            <FirmaRetro retroId={retro.id} />
                          ) : (
                            <p className="text-xs text-muted-foreground">La sesión está pendiente; cuando esté lista podrás firmarla aquí.</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
