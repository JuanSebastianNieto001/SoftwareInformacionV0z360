/**
 * Lo que un colaborador ve de su retroalimentación: el feedback dirigido a él,
 * con su plan de acción, y la respuesta de conformidad que registra desde
 * aquí. No hace falta tener el cuadro: RLS entrega solo lo propio
 * (colaborador_usuario_id = quien entra).
 */
import type { Metadata } from "next";
import { CheckCircle2, FileText, MessageSquareHeart, PenLine, Target } from "lucide-react";
import { ResponderConformidad } from "@/components/feedback/responder-conformidad";
import { EncabezadoPagina, EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { ETIQUETA_CONFORMIDAD, ETIQUETA_ESTADO_FEEDBACK, ETIQUETA_GRAVEDAD, varianteConformidad } from "@/lib/feedback";
import { formatearFecha, formatearFechaHora } from "@/lib/formato";
import { exigirSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mis feedback" };

export default async function PaginaMisFeedback() {
  const { supabase, user, perfil } = await exigirSesion();
  const { data } = await supabase.from("v_feedback").select("*").eq("colaborador_usuario_id", user.id).order("fecha", { ascending: false }).limit(100);
  const lista = data ?? [];

  return (
    <>
      <EncabezadoPagina kicker="Feedback" titulo="Mis feedback" descripcion={`${perfil.nombre} · tu retroalimentación operativa y tu firma.`} />
      {lista.length === 0 ? (
        <EstadoVacio icono={<MessageSquareHeart />} titulo="No tienes feedback registrado" descripcion="Cuando te registren una retroalimentación la verás aquí y recibirás un aviso." />
      ) : (
        <ul className="space-y-6">
          {lista.map((f) => (
            <li key={f.id} className="overflow-hidden rounded-[24px] border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              {/* Cabecera: motivo del catálogo */}
              <div className={cn("px-6 py-5 text-white", f.es_positivo ? "bg-emerald-700" : "bg-marino")}>
                <p className="text-xs font-semibold tracking-[0.12em] text-white/70 uppercase">
                  {f.tipo} · {f.subtipo}
                </p>
                <p className="mt-1 text-[18px] leading-snug font-semibold">{f.detalle}</p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/85">
                  <span>{formatearFecha(`${f.fecha}T12:00:00-05:00`)}</span>
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">
                    {f.es_positivo ? "Reconocimiento" : `Gravedad ${ETIQUETA_GRAVEDAD[f.gravedad].toLowerCase()}`}
                  </span>
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">{ETIQUETA_ESTADO_FEEDBACK[f.estado]}</span>
                </p>
              </div>

              <div className="space-y-4 p-5 sm:p-6">
                <div className="rounded-[18px] bg-zona/60 p-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">
                    <FileText className="size-3.5" aria-hidden /> Qué pasó
                  </p>
                  <p className="mt-1.5 text-sm whitespace-pre-line">{f.descripcion}</p>
                </div>

                {f.plan_accion && (
                  <div className="rounded-[18px] border border-primary/30 bg-tinte p-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">
                      <Target className="size-3.5" aria-hidden /> Tu compromiso
                    </p>
                    <p className="mt-1.5 text-sm whitespace-pre-line">{f.plan_accion}</p>
                  </div>
                )}

                <div className="overflow-hidden rounded-[18px] border">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-zona/60 px-4 py-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">
                      <PenLine className="size-3.5" aria-hidden /> Tu firma
                    </p>
                    {f.conformidad ? (
                      <Badge variant={varianteConformidad(f.conformidad)}>{ETIQUETA_CONFORMIDAD[f.conformidad]}</Badge>
                    ) : (
                      <Badge variant="outline">Pendiente</Badge>
                    )}
                  </div>
                  <div className="p-4">
                    {f.conformidad ? (
                      <div className="space-y-1">
                        {f.conformidad_comentario && <p className="text-sm">{f.conformidad_comentario}</p>}
                        {f.conformidad_en && (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CheckCircle2 className="size-3.5 text-emerald-700" aria-hidden /> Firmado el {formatearFechaHora(f.conformidad_en)}. La firma queda en el registro de auditoría.
                          </p>
                        )}
                      </div>
                    ) : (
                      <ResponderConformidad id={f.id} esPositivo={f.es_positivo} />
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
