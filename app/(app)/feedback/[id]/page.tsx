// Un feedback: motivo, colaborador, hechos, plan, gestión del cuadro y la
// conformidad del colaborador. Abrirlo queda en la auditoría.
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EliminarFeedback } from "@/components/feedback/eliminar-feedback";
import { PanelGestion } from "@/components/feedback/panel-gestion";
import { ResponderConformidad } from "@/components/feedback/responder-conformidad";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { registrarAcceso } from "@/lib/auditoria";
import {
  ETIQUETA_CONFORMIDAD,
  ETIQUETA_ESTADO_FEEDBACK,
  ETIQUETA_GRAVEDAD,
  ETIQUETA_SEVERIDAD,
  varianteConformidad,
  varianteEstadoFeedback,
  varianteGravedad,
} from "@/lib/feedback";
import { formatearFecha, formatearFechaHora } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos-acceso";

export const metadata: Metadata = { title: "Feedback" };

export default async function PaginaFeedbackDetalle({ params }: PageProps<"/feedback/[id]">) {
  const { id } = await params;
  const { supabase, user, perfil, puedeEditar } = await exigirModulo("feedback");
  // Eliminar es solo para quien tiene Total explícito (coordinación de Formación).
  const { data: puedeEliminar } = await supabase.rpc("feedback_puede_eliminar");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data: f } = await supabase.from("v_feedback").select("*").eq("id", id).maybeSingle();
  if (!f) notFound();

  await registrarAcceso(supabase, user, {
    accion: "abrir",
    documento: { id: null, titulo: `Feedback · ${f.colaborador_nombre} · ${f.subtipo}`, area_nombre: "Feedback" },
    perfilNombre: perfil.nombre,
    request: { headers: await headers() },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link href="/feedback">
            <ArrowLeft /> Todo el feedback
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {puedeEditar && (
            <Button variant="outline" asChild>
              <Link href={`/feedback/${f.id}/editar`}>Editar</Link>
            </Button>
          )}
          {puedeEliminar && <EliminarFeedback id={f.id} colaborador={f.colaborador_nombre} />}
        </div>
      </div>

      <header className={`rounded-[24px] px-6 py-5 text-white ${f.es_positivo ? "bg-emerald-700" : "bg-marino"}`}>
        <p className="text-xs font-semibold tracking-[0.12em] text-white/70 uppercase">
          {f.tipo} · {f.subtipo}
        </p>
        <h2 className="mt-1 text-[22px] leading-tight font-semibold sm:text-[26px]">{f.detalle}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/85">
          <span className="font-medium text-white">{f.colaborador_nombre}</span>
          {f.team_leader && <span>Team leader: {f.team_leader}</span>}
          <span>Hecho del {formatearFecha(`${f.fecha}T12:00:00-05:00`)}</span>
          <Badge variant="outline" className="border-white/40 text-white">
            {f.es_positivo ? "Reconocimiento" : "Oportunidad de mejora"}
          </Badge>
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="rounded-[20px]">
          <CardContent className="space-y-4 px-[22px] py-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant={varianteGravedad(f.gravedad)}>Gravedad: {ETIQUETA_GRAVEDAD[f.gravedad]}</Badge>
              <Badge variant="secondary">{ETIQUETA_SEVERIDAD[f.severidad]}</Badge>
              <Badge variant={varianteEstadoFeedback(f.estado)}>{ETIQUETA_ESTADO_FEEDBACK[f.estado]}</Badge>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">Descripción de los hechos</p>
              <p className="mt-1 text-sm whitespace-pre-line">{f.descripcion}</p>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">Compromiso del colaborador</p>
              {f.plan_accion ? (
                <p className="mt-1 text-sm whitespace-pre-line">{f.plan_accion}</p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  {f.es_positivo ? "Es un reconocimiento: no exige compromiso." : "Aún sin compromiso: lo escribe el colaborador al firmar, y te llegará la notificación."}
                </p>
              )}
            </div>
            {f.fecha_seguimiento && (
              <p className="text-sm text-muted-foreground">
                Seguimiento programado para {formatearFecha(`${f.fecha_seguimiento}T12:00:00-05:00`)}
                {f.seguimiento_vencido && <span className="ml-2 font-medium text-red-700">vencido</span>}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Registrado por {f.creado_por_nombre || "—"} el {formatearFecha(f.creado_en)}.</p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Conformidad */}
          <Card className="rounded-[20px]">
            <CardContent className="space-y-3 px-[22px] py-5">
              <p className="text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">Firma del colaborador</p>
              {f.conformidad ? (
                <div className="space-y-1">
                  <Badge variant={varianteConformidad(f.conformidad)}>{ETIQUETA_CONFORMIDAD[f.conformidad]}</Badge>
                  {f.conformidad_comentario && <p className="text-sm">{f.conformidad_comentario}</p>}
                  {f.conformidad_en && <p className="text-xs text-muted-foreground">✍️ Firmado el {formatearFechaHora(f.conformidad_en)}.</p>}
                </div>
              ) : f.colaborador_usuario_id ? (
                <>
                  <p className="text-sm text-muted-foreground">Pendiente: el colaborador escribe su compromiso y firma desde «Mis feedback» (ya tiene el aviso en su campana).</p>
                  {puedeEditar && (
                    <details>
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none">¿Respondió en persona? Registra su compromiso y firma aquí</summary>
                      <div className="mt-2">
                        <ResponderConformidad id={f.id} enNombreDelColaborador esPositivo={f.es_positivo} />
                      </div>
                    </details>
                  )}
                </>
              ) : puedeEditar ? (
                <ResponderConformidad id={f.id} enNombreDelColaborador esPositivo={f.es_positivo} />
              ) : (
                <p className="text-sm text-muted-foreground">Pendiente del compromiso y la firma del colaborador.</p>
              )}
            </CardContent>
          </Card>

          {puedeEditar && <PanelGestion feedback={f} />}
        </div>
      </section>
    </div>
  );
}
