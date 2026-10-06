/**
 * Lo que un asesor ve de calidad: sus auditorías publicadas con los ítems
 * que no cumplió y la retroalimentación con sus compromisos, que firma
 * desde aquí. No hace falta tener el cuadro de Calidad: RLS entrega solo lo
 * propio, y la página además filtra por la fila de la estructura de quien
 * entra, para que quien sí tiene el cuadro no vea aquí a todo el mundo.
 */
import type { Metadata } from "next";
import { BadgeCheck, CheckCircle2 } from "lucide-react";
import { FirmaRetro } from "@/components/calidad/firma-retro";
import { EncabezadoPagina, EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { ETIQUETA_ESTADO_COMPROMISO, ETIQUETA_ESTADO_RETRO, formatearPorcentaje, varianteNotaCalidad } from "@/lib/calidad";
import { formatearFecha, formatearFechaHora } from "@/lib/formato";
import { exigirSesion } from "@/lib/sesion";

export const metadata: Metadata = { title: "Mis evaluaciones de calidad" };

export default async function PaginaMisEvaluaciones() {
  const { supabase, user } = await exigirSesion();

  const { data: yo } = await supabase.from("calidad_asesores").select("id, nombre, team_leader").eq("usuario_id", user.id).maybeSingle();
  const { data: evals } = yo
    ? await supabase.from("v_calidad_evaluaciones").select("*").eq("asesor_id", yo.id).eq("estado", "publicada").order("fecha_auditoria", { ascending: false }).limit(50)
    : { data: [] };
  const lista = evals ?? [];
  const ids = lista.map((e) => e.id);
  const [{ data: fallas }, { data: items }, { data: retros }] = await Promise.all([
    ids.length ? supabase.from("calidad_respuestas").select("evaluacion_id, item_id, hallazgo").eq("resultado", "no_cumple").in("evaluacion_id", ids) : Promise.resolve({ data: [] as { evaluacion_id: string; item_id: string; hallazgo: string | null }[] }),
    supabase.from("calidad_items").select("id, categoria, descripcion, es_fatal"),
    ids.length ? supabase.from("calidad_retroalimentaciones").select("*").in("evaluacion_id", ids) : Promise.resolve({ data: [] as never[] }),
  ]);
  const retroIds = (retros ?? []).map((r) => r.id);
  const { data: compromisos } = retroIds.length ? await supabase.from("calidad_compromisos").select("*").in("retro_id", retroIds).order("fecha_limite") : { data: [] };
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
            const misFallas = (fallas ?? []).filter((f) => f.evaluacion_id === e.id);
            const retro = (retros ?? []).find((r) => r.evaluacion_id === e.id) ?? null;
            const comp = retro ? (compromisos ?? []).filter((c) => c.retro_id === retro.id) : [];
            return (
              <li key={e.id} className="space-y-4 rounded-[24px] border bg-card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                      {e.tipo}
                      {e.etapa ? ` · ${e.etapa}` : ""} · interacción del {formatearFecha(e.fecha_interaccion)}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Auditada el {formatearFecha(e.fecha_auditoria)} por {e.analista_nombre}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[30px] leading-none font-semibold tabular-nums">{formatearPorcentaje(nota)}</p>
                    <Badge className="mt-1" variant={varianteNotaCalidad(nota, Number(e.nota_minima))}>
                      {e.aprobada ? "Aprobada" : "No aprobada"}
                      {Number(e.n_fatales_fallados) > 0 ? " · error crítico" : ""}
                    </Badge>
                  </div>
                </div>

                {e.puntos_mejora && <p className="rounded-[16px] bg-zona/60 p-3 text-sm">{e.puntos_mejora}</p>}

                {misFallas.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">Ítems por mejorar</p>
                    <ul className="mt-2 space-y-1.5">
                      {misFallas.map((f) => {
                        const it = itemPorId.get(f.item_id);
                        return (
                          <li key={f.item_id} className="text-sm">
                            <span className="text-xs text-muted-foreground">{it?.categoria} · </span>
                            {it?.descripcion ?? "Ítem"}
                            {it?.es_fatal && (
                              <Badge variant="destructive" className="ml-1 align-middle">
                                crítico
                              </Badge>
                            )}
                            {f.hallazgo && <span className="block text-xs text-muted-foreground">{f.hallazgo}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <div className="space-y-3 rounded-[18px] border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">Retroalimentación</p>
                    {retro && (
                      <Badge variant={retro.estado === "firmada" ? "default" : "secondary"}>
                        {retro.estado === "firmada" && <CheckCircle2 className="mr-1 size-3" />}
                        {ETIQUETA_ESTADO_RETRO[retro.estado]}
                      </Badge>
                    )}
                  </div>
                  {!retro ? (
                    <p className="text-sm text-muted-foreground">Aún no se ha hecho la sesión de retroalimentación de esta auditoría.</p>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">Sesión con {retro.realizada_por_nombre}</p>
                      {retro.fortalezas && (
                        <p className="text-sm">
                          <span className="font-medium">Fortalezas:</span> {retro.fortalezas}
                        </p>
                      )}
                      {retro.oportunidades && (
                        <p className="text-sm">
                          <span className="font-medium">Oportunidades:</span> {retro.oportunidades}
                        </p>
                      )}
                      {comp.length > 0 && (
                        <ul className="space-y-1 text-sm">
                          {comp.map((c) => (
                            <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-tinte px-3 py-2">
                              <span>{c.descripcion}</span>
                              <span className="text-xs text-muted-foreground">
                                límite {formatearFecha(c.fecha_limite)} · {ETIQUETA_ESTADO_COMPROMISO[c.estado]}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {retro.estado === "firmada" ? (
                        <p className="text-xs text-muted-foreground">
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
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
