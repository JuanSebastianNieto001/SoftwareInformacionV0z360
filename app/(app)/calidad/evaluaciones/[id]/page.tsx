/**
 * Una auditoría de calidad: datos de la interacción, la pauta (editable
 * mientras es borrador), la nota y la sesión de retroalimentación con sus
 * compromisos. Abrirla queda en la auditoría: es información de desempeño
 * de una persona.
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EliminarAuditoria } from "@/components/calidad/eliminar-auditoria";
import { DialogoEditarAuditoria } from "@/components/calidad/formulario-auditoria";
import { PautaAuditoria } from "@/components/calidad/pauta-auditoria";
import { PanelRetroalimentacion } from "@/components/calidad/retroalimentacion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { registrarAcceso } from "@/lib/auditoria";
import { ETIQUETA_CANAL, ETIQUETA_ESTADO_EVALUACION_CALIDAD, formatearPorcentaje, varianteNotaCalidad } from "@/lib/calidad";
import { formatearFecha } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos-acceso";
import type { CANALES } from "@/lib/calidad";

export const metadata: Metadata = { title: "Auditoría de calidad" };

export default async function PaginaAuditoria({ params }: PageProps<"/calidad/evaluaciones/[id]">) {
  const { id } = await params;
  const { supabase, user, perfil, puedeEditar } = await exigirModulo("calidad");

  const [{ data: ev }, { data: puedeEliminar }] = await Promise.all([
    supabase.from("v_calidad_evaluaciones").select("*").eq("id", id).maybeSingle(),
    // Eliminar es solo para quien tiene Total explícito (coordinación de Formación).
    supabase.rpc("calidad_puede_eliminar"),
  ]);
  if (!ev) notFound();

  const [{ data: items }, { data: respuestas }, { data: retro }, { data: matrices }, { data: asesores }] = await Promise.all([
    supabase.from("calidad_items").select("*").eq("matriz_id", ev.matriz_id).order("orden"),
    supabase.from("calidad_respuestas").select("item_id, resultado, hallazgo").eq("evaluacion_id", id),
    supabase.from("calidad_retroalimentaciones").select("*").eq("evaluacion_id", id).maybeSingle(),
    supabase.from("calidad_matrices").select("id, nombre, activa").order("nombre"),
    supabase.from("calidad_asesores").select("id, nombre, team_leader, activo").order("nombre"),
  ]);
  const { data: compromisos } = retro
    ? await supabase.from("calidad_compromisos").select("*").eq("retro_id", retro.id).order("fecha_limite")
    : { data: [] };

  await registrarAcceso(supabase, user, {
    accion: "abrir",
    documento: { id: null, titulo: `Auditoría · ${ev.asesor_nombre} · ${ev.fecha_interaccion}`, area_nombre: "Calidad" },
    perfilNombre: perfil.nombre,
    request: { headers: await headers() },
  });

  const borrador = ev.estado === "borrador";
  const nota = ev.nota_final === null ? null : Number(ev.nota_final);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link href="/calidad/evaluaciones">
            <ArrowLeft /> Auditorías
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {puedeEditar && borrador && (
            <DialogoEditarAuditoria evaluacion={ev} matrices={matrices ?? []} asesores={asesores ?? []} />
          )}
          {puedeEliminar && <EliminarAuditoria id={ev.id} asesor={ev.asesor_nombre} fecha={formatearFecha(ev.fecha_interaccion)} />}
        </div>
      </div>

      <header className="rounded-[24px] bg-marino px-6 py-5 text-white">
        <p className="text-xs font-semibold tracking-[0.12em] text-white/70 uppercase">
          {ev.matriz_nombre} · {ev.tipo}
          {ev.etapa ? ` · ${ev.etapa}` : ""}
        </p>
        <h2 className="mt-1 text-[22px] leading-tight font-semibold sm:text-[26px]">{ev.asesor_nombre}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
          {ev.team_leader && <span>Team leader: {ev.team_leader}</span>}
          <span>Interacción {formatearFecha(ev.fecha_interaccion)}</span>
          <span>Auditada {formatearFecha(ev.fecha_auditoria)} por {ev.analista_nombre}</span>
          <span>{ETIQUETA_CANAL[ev.canal as (typeof CANALES)[number]] ?? ev.canal}</span>
          {ev.duracion && <span>{ev.duracion}</span>}
          <Badge variant={borrador ? "secondary" : "outline"} className="border-white/40 text-white">
            {ETIQUETA_ESTADO_EVALUACION_CALIDAD[ev.estado]}
          </Badge>
          {!borrador && nota !== null && (
            <Badge variant={varianteNotaCalidad(nota, Number(ev.nota_minima))} className="text-white">
              {formatearPorcentaje(nota)}
            </Badge>
          )}
        </p>
        {ev.nota_importada !== null && (
          <p className="mt-2 text-xs text-white/70">
            Auditoría importada del formulario anterior, donde obtuvo <span className="font-semibold text-white">{formatearPorcentaje(Number(ev.nota_importada))}</span>. La nota de arriba se recalcula con los pesos actuales de la pauta.
          </p>
        )}
        {ev.detalle && <p className="mt-3 text-sm whitespace-pre-line text-white/85">{ev.detalle}</p>}
        {ev.puntos_mejora && (
          <p className="mt-2 text-sm text-white/85">
            <span className="font-semibold">Puntos de mejora:</span> {ev.puntos_mejora}
          </p>
        )}
      </header>

      <PautaAuditoria
        evaluacionId={ev.id}
        items={items ?? []}
        respuestas={respuestas ?? []}
        errorFatalAnula={ev.error_fatal_anula}
        notaMinima={Number(ev.nota_minima)}
        editable={puedeEditar && borrador}
      />

      <section className="space-y-3">
        <h3 className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">Retroalimentación</h3>
        {borrador ? (
          <p className="text-sm text-muted-foreground">La retroalimentación se abre una vez publicada la auditoría.</p>
        ) : (
          <PanelRetroalimentacion evaluacionId={ev.id} retro={retro ?? null} compromisos={compromisos ?? []} puedeEditar={puedeEditar} />
        )}
      </section>
    </div>
  );
}
