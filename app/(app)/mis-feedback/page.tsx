/**
 * Lo que un colaborador ve de su retroalimentación: el feedback dirigido a él,
 * con su plan de acción, y la respuesta de conformidad que registra desde
 * aquí. No hace falta tener el cuadro: RLS entrega solo lo propio
 * (colaborador_usuario_id = quien entra).
 */
import type { Metadata } from "next";
import { MessageSquareHeart } from "lucide-react";
import { ResponderConformidad } from "@/components/feedback/responder-conformidad";
import { EncabezadoPagina, EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import {
  ETIQUETA_CONFORMIDAD,
  ETIQUETA_ESTADO_FEEDBACK,
  ETIQUETA_GRAVEDAD,
  varianteConformidad,
  varianteEstadoFeedback,
  varianteGravedad,
} from "@/lib/feedback";
import { formatearFecha, formatearFechaHora } from "@/lib/formato";
import { exigirSesion } from "@/lib/sesion";

export const metadata: Metadata = { title: "Mis feedback" };

export default async function PaginaMisFeedback() {
  const { supabase, user, perfil } = await exigirSesion();
  const { data } = await supabase.from("v_feedback").select("*").eq("colaborador_usuario_id", user.id).order("fecha", { ascending: false }).limit(100);
  const lista = data ?? [];

  return (
    <>
      <EncabezadoPagina kicker="Retroalimentación" titulo="Mis feedback" descripcion={`${perfil.nombre} · tu retroalimentación operativa y tu firma.`} />
      {lista.length === 0 ? (
        <EstadoVacio icono={<MessageSquareHeart />} titulo="No tienes feedback registrado" descripcion="Cuando te registren una retroalimentación la verás aquí y recibirás un aviso." />
      ) : (
        <ul className="space-y-6">
          {lista.map((f) => (
            <li key={f.id} className={`space-y-4 rounded-[24px] border p-5 sm:p-6 ${f.es_positivo ? "bg-emerald-50/60" : "bg-card"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                    {f.tipo} · {f.subtipo} · {formatearFecha(`${f.fecha}T12:00:00-05:00`)}
                  </p>
                  <p className="mt-0.5 font-semibold">{f.detalle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={varianteGravedad(f.gravedad)}>{ETIQUETA_GRAVEDAD[f.gravedad]}</Badge>
                  <Badge variant={varianteEstadoFeedback(f.estado)}>{ETIQUETA_ESTADO_FEEDBACK[f.estado]}</Badge>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">Qué pasó</p>
                <p className="mt-1 text-sm whitespace-pre-line">{f.descripcion}</p>
              </div>
              {f.plan_accion && (
                <div className="rounded-[16px] bg-zona/60 p-3">
                  <p className="text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">Compromiso / plan de acción</p>
                  <p className="mt-1 text-sm whitespace-pre-line">{f.plan_accion}</p>
                </div>
              )}

              <div className="rounded-[18px] border p-4">
                <p className="text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">Tu firma</p>
                {f.conformidad ? (
                  <div className="mt-2 space-y-1">
                    <Badge variant={varianteConformidad(f.conformidad)}>{ETIQUETA_CONFORMIDAD[f.conformidad]}</Badge>
                    {f.conformidad_comentario && <p className="text-sm">{f.conformidad_comentario}</p>}
                    {f.conformidad_en && <p className="text-xs text-muted-foreground">✍️ Firmado el {formatearFechaHora(f.conformidad_en)}. La firma queda en el registro de auditoría.</p>}
                  </div>
                ) : (
                  <div className="mt-2">
                    <ResponderConformidad id={f.id} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
