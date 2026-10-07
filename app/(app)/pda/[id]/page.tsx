// Un PDA: resumen del mes, sus indicadores con el avance hacia la meta y las
// mediciones de cada uno.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Target } from "lucide-react";
import { eliminarIndicador, eliminarMedicion, eliminarPlan } from "@/app/acciones/pda";
import { BotonEliminar } from "@/components/comunes/boton-eliminar";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { BarraAvance, DistintivoMeta, estadoMeta } from "@/components/pda/avance";
import { BotonEstadoPlan } from "@/components/pda/boton-estado-plan";
import { FormularioIndicador } from "@/components/pda/formulario-indicador";
import { FormularioMedicion } from "@/components/pda/formulario-medicion";
import { FormularioPlan } from "@/components/pda/formulario-plan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatearFecha } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos-acceso";
import { ETIQUETA_AGREGACION, SIMBOLO_SENTIDO, conUnidad, nombreMes, porcentaje } from "@/lib/pda";
import type { MedicionPda } from "@/lib/supabase/tipos";

export const metadata: Metadata = { title: "PDA del mes" };

export default async function PaginaPlanPda({ params }: PageProps<"/pda/[id]">) {
  const { id } = await params;
  const { supabase, puedeEditar, puedeEliminar } = await exigirModulo("pda");

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data: plan } = await supabase.from("v_pda_planes").select("*").eq("id", id).maybeSingle();
  if (!plan) notFound();

  const { data: indicadores } = await supabase
    .from("v_pda_indicadores")
    .select("*")
    .eq("plan_id", id)
    .order("orden")
    .order("creado_en");
  const ids = (indicadores ?? []).map((i) => i.id);
  const { data: mediciones } = ids.length
    ? await supabase
        .from("pda_mediciones")
        .select("*")
        .in("indicador_id", ids)
        .order("fecha", { ascending: false })
        .order("creado_en", { ascending: false })
    : { data: [] as MedicionPda[] };

  const cerrado = plan.estado === "cerrado";
  const editable = puedeEditar && !cerrado;
  const lista = indicadores ?? [];
  const porIndicador = new Map<string, MedicionPda[]>();
  for (const m of mediciones ?? []) {
    porIndicador.set(m.indicador_id, [...(porIndicador.get(m.indicador_id) ?? []), m]);
  }
  const estadoGeneral = estadoMeta(
    plan.indicadores === 0 || plan.medidos === 0 ? null : plan.meta_alcanzada,
    cerrado,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link href="/pda">
            <ArrowLeft /> Todos los meses
          </Link>
        </Button>
        {puedeEditar && (
          <div className="flex flex-wrap gap-2">
            {!cerrado && <FormularioPlan plan={plan} />}
            <BotonEstadoPlan id={plan.id} cerrado={cerrado} />
            {puedeEliminar && (
              <BotonEliminar
                accion={eliminarPlan.bind(null, plan.id)}
                titulo={`Eliminar ${plan.titulo}`}
                descripcion="Se borran el PDA, sus indicadores y todas sus mediciones. No se puede deshacer."
                volverA="/pda"
              />
            )}
          </div>
        )}
      </div>

      {/* Resumen del mes */}
      <Card className="rounded-[20px]">
        <CardContent className="grid gap-5 px-[22px] py-5 md:grid-cols-[2fr_1fr_1fr]">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">{nombreMes(plan.periodo)}</p>
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              {plan.titulo}
              {cerrado && (
                <Badge variant="secondary">
                  <Lock /> Cerrado
                </Badge>
              )}
            </h2>
            {plan.objetivo && <p className="text-sm whitespace-pre-line text-muted-foreground">{plan.objetivo}</p>}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Cumplimiento</p>
            <p className="text-3xl font-semibold tabular-nums">{porcentaje(plan.cumplimiento)}</p>
            <BarraAvance
              avance={plan.indicadores > 0 ? plan.cumplimiento : null}
              estado={estadoGeneral}
              detalle={`Cumplimiento ponderado ${porcentaje(plan.cumplimiento)}`}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Indicadores que cumplen</p>
            <p className="text-3xl font-semibold tabular-nums">
              {plan.cumplen}
              <span className="text-lg text-muted-foreground"> / {plan.indicadores}</span>
            </p>
            <DistintivoMeta
              estado={estadoGeneral}
              etiqueta={
                estadoGeneral === "cumple"
                  ? "Meta del mes alcanzada"
                  : estadoGeneral === "no_cumple"
                    ? "Meta del mes no alcanzada"
                    : undefined
              }
            />
          </div>
        </CardContent>
      </Card>

      {cerrado && puedeEditar && (
        <p className="text-sm text-muted-foreground">
          El PDA está cerrado y sus resultados quedaron congelados. Para corregir algo, reábrelo.
        </p>
      )}

      {/* Indicadores */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">
            Indicadores <Badge variant="outline">{lista.length}</Badge>
          </h2>
          {editable && <FormularioIndicador planId={plan.id} siguienteOrden={lista.length} />}
        </div>

        {lista.length === 0 ? (
          <EstadoVacio
            icono={<Target />}
            titulo="Este PDA todavía no tiene indicadores"
            descripcion={editable ? "Agrega el primero con su meta." : "Cuando se agreguen aparecerán aquí."}
          />
        ) : (
          <ul className="space-y-3">
            {lista.map((ind) => {
              const estado = estadoMeta(ind.cumple, cerrado);
              const meds = porIndicador.get(ind.id) ?? [];
              return (
                <li key={ind.id}>
                  <Card className="rounded-[20px]">
                    <CardContent className="space-y-3 px-[22px] py-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold">{ind.nombre}</h3>
                          <p className="text-xs text-muted-foreground">
                            Meta {SIMBOLO_SENTIDO[ind.sentido]} {conUnidad(ind.meta, ind.unidad)} ·{" "}
                            {ETIQUETA_AGREGACION[ind.agregacion].toLowerCase()}
                            {Number(ind.peso) !== 1 && ` · peso ${ind.peso}`}
                            {ind.responsable && ` · ${ind.responsable}`}
                          </p>
                          {ind.descripcion && <p className="mt-1 text-sm text-muted-foreground">{ind.descripcion}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          {editable && <FormularioMedicion planId={plan.id} indicador={ind} />}
                          {editable && <FormularioIndicador planId={plan.id} indicador={ind} />}
                          {puedeEliminar && !cerrado && (
                            <BotonEliminar
                              compacto
                              accion={eliminarIndicador.bind(null, ind.id, plan.id)}
                              titulo={`Eliminar ${ind.nombre}`}
                              descripcion="Se borran el indicador y sus mediciones."
                            />
                          )}
                        </div>
                      </div>

                      <div className="grid items-center gap-3 sm:grid-cols-[10rem_1fr_auto]">
                        <p className="text-sm">
                          <span className="text-muted-foreground">Resultado </span>
                          <span className="font-semibold tabular-nums">{conUnidad(ind.resultado, ind.unidad)}</span>
                        </p>
                        <BarraAvance
                          avance={ind.avance}
                          estado={estado}
                          detalle={`${ind.nombre}: ${conUnidad(ind.resultado, ind.unidad)} frente a la meta ${SIMBOLO_SENTIDO[ind.sentido]} ${conUnidad(ind.meta, ind.unidad)}`}
                        />
                        <DistintivoMeta estado={estado} />
                      </div>

                      {meds.length > 0 && (
                        <details className="group rounded-lg border bg-muted/30 px-3 py-2">
                          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                            {meds.length} {meds.length === 1 ? "medición" : "mediciones"}
                            {ind.ultima_fecha && ` · última ${formatearFecha(`${ind.ultima_fecha}T12:00:00-05:00`)}`}
                          </summary>
                          <ul className="mt-2 divide-y text-sm">
                            {meds.map((m) => (
                              <li key={m.id} className="flex items-center justify-between gap-2 py-1.5">
                                <span className="min-w-0">
                                  <span className="tabular-nums">{formatearFecha(`${m.fecha}T12:00:00-05:00`)}</span>
                                  <span className="mx-2 font-medium tabular-nums">{conUnidad(m.valor, ind.unidad)}</span>
                                  {m.observacion && <span className="text-muted-foreground">{m.observacion}</span>}
                                </span>
                                {editable && (
                                  <BotonEliminar
                                    compacto
                                    accion={eliminarMedicion.bind(null, m.id, plan.id)}
                                    titulo="Eliminar medición"
                                    descripcion="Se borra esta medición y el resultado del indicador se recalcula."
                                  />
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
