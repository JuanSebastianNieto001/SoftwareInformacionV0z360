// Un PDA: la cabecera del formato, el resumen del mes y sus objetivos, cada
// uno con la lista de chequeo y las evidencias.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileSpreadsheet, Lock, Target } from "lucide-react";
import { eliminarPlan } from "@/app/acciones/pda";
import { BotonEliminar } from "@/components/comunes/boton-eliminar";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { BarraAvance, DistintivoEstado } from "@/components/pda/avance";
import { BotonEstadoPlan } from "@/components/pda/boton-estado-plan";
import { FormularioObjetivo } from "@/components/pda/formulario-objetivo";
import { FormularioPlan } from "@/components/pda/formulario-plan";
import { TarjetaObjetivo } from "@/components/pda/tarjeta-objetivo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatearFecha } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos-acceso";
import { estadoObjetivo, nombreMes, porcentaje } from "@/lib/pda";
import type { EvidenciaPda, TareaPda } from "@/lib/supabase/tipos";

export const metadata: Metadata = { title: "PDA del mes" };

export default async function PaginaPlanPda({ params }: PageProps<"/pda/[id]">) {
  const { id } = await params;
  const { supabase, puedeEditar, puedeEliminar } = await exigirModulo("pda");

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data: plan } = await supabase.from("v_pda_planes").select("*").eq("id", id).maybeSingle();
  if (!plan) notFound();

  const { data: objetivos } = await supabase.from("v_pda_objetivos").select("*").eq("plan_id", id).order("orden").order("creado_en");
  const lista = objetivos ?? [];
  const ids = lista.map((o) => o.id);
  const [{ data: tareas }, { data: evidencias }] = ids.length
    ? await Promise.all([
        supabase.from("pda_tareas").select("*").in("objetivo_id", ids).order("orden").order("creado_en"),
        supabase.from("pda_evidencias").select("*").in("objetivo_id", ids).order("creado_en"),
      ])
    : [{ data: [] as TareaPda[] }, { data: [] as EvidenciaPda[] }];

  // Nombres de quien marcó o subió, para no mostrar identificadores.
  const personas = new Set<string>();
  for (const t of tareas ?? []) if (t.completada_por) personas.add(t.completada_por);
  for (const e of evidencias ?? []) if (e.subido_por) personas.add(e.subido_por);
  const nombres: Record<string, string> = {};
  if (personas.size) {
    const { data: perfiles } = await supabase.from("perfiles").select("id, nombre").in("id", [...personas]);
    for (const p of perfiles ?? []) nombres[p.id] = p.nombre;
  }

  const cerrado = plan.estado === "cerrado";
  const editable = puedeEditar && !cerrado;
  const porObjetivo = <T extends { objetivo_id: string }>(filas: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const f of filas ?? []) m.set(f.objetivo_id, [...(m.get(f.objetivo_id) ?? []), f]);
    return m;
  };
  const tareasPor = porObjetivo(tareas);
  const evidenciasPor = porObjetivo(evidencias);
  const estadoGeneral = plan.n_objetivos === 0 ? "sin_datos" : plan.cumplimiento !== null ? estadoObjetivo(plan.cumplimiento) : plan.n_tareas > 0 ? "en_curso" : "sin_datos";
  const sinCerrar = plan.n_objetivos - plan.n_objetivos_cerrados;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link href="/pda">
            <ArrowLeft /> Todos los meses
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/pda/${plan.id}/xlsx`}>
              <FileSpreadsheet /> Descargar Excel
            </a>
          </Button>
          {puedeEditar && !cerrado && <FormularioPlan plan={plan} />}
          {puedeEditar && <BotonEstadoPlan id={plan.id} cerrado={cerrado} />}
          {puedeEliminar && (
            <BotonEliminar
              accion={eliminarPlan.bind(null, plan.id)}
              titulo={`Eliminar ${plan.titulo}`}
              descripcion="Se borran el PDA, sus objetivos, las listas de chequeo y todas las evidencias. No se puede deshacer."
              volverA="/pda"
            />
          )}
        </div>
      </div>

      {/* Cabecera del formato */}
      <header className="rounded-[24px] bg-marino px-6 py-5 text-white">
        <p className="text-xs font-semibold tracking-[0.12em] text-white/70 uppercase">
          {plan.codigo} · Versión {plan.version} · {nombreMes(plan.periodo)}
        </p>
        <h2 className="mt-1 text-[22px] leading-tight font-semibold sm:text-[26px]">{plan.titulo}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
          <span className="font-medium text-white">{plan.cargo}</span>
          <span>{plan.responsable}</span>
          <Badge variant={cerrado ? "secondary" : "outline"} className="border-white/40 text-white">
            {cerrado ? (
              <>
                <Lock /> Cerrado {plan.cerrado_en && formatearFecha(plan.cerrado_en)}
              </>
            ) : (
              "Abierto"
            )}
          </Badge>
        </p>
        {plan.objetivo_general && <p className="mt-3 text-sm whitespace-pre-line text-white/85">{plan.objetivo_general}</p>}
        {(plan.antecedentes || plan.entregables) && (
          <details className="mt-3 text-sm text-white/85">
            <summary className="cursor-pointer text-xs font-medium text-white/70 select-none">Antecedentes y entregables</summary>
            {plan.antecedentes && (
              <p className="mt-2 whitespace-pre-line">
                <span className="font-semibold text-white">Antecedentes. </span>
                {plan.antecedentes}
              </p>
            )}
            {plan.entregables && (
              <p className="mt-2 whitespace-pre-line">
                <span className="font-semibold text-white">Entregables. </span>
                {plan.entregables}
              </p>
            )}
          </details>
        )}
      </header>

      {/* Resumen del mes */}
      <Card className="rounded-[20px]">
        <CardContent className="grid gap-5 px-[22px] py-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Cumplimiento</p>
            <p className="text-3xl font-semibold tabular-nums">{porcentaje(plan.cumplimiento)}</p>
            <BarraAvance avance={plan.cumplimiento} estado={plan.cumplimiento === null ? "sin_datos" : estadoObjetivo(plan.cumplimiento)} detalle="Promedio del % de cumplimiento de los objetivos cerrados" />
            <p className="text-xs text-muted-foreground">
              {plan.n_objetivos_cerrados} de {plan.n_objetivos} objetivos con cierre
              {sinCerrar > 0 && plan.n_objetivos_cerrados > 0 && ` · ${sinCerrar} sin cerrar`}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Proyección</p>
            <p className="text-3xl font-semibold tabular-nums">{porcentaje(plan.proyeccion)}</p>
            <p className="text-xs text-muted-foreground">promedio proyectado al planear</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Actividades</p>
            <p className="text-3xl font-semibold tabular-nums">
              {plan.n_tareas_hechas}
              <span className="text-lg text-muted-foreground"> / {plan.n_tareas}</span>
            </p>
            <BarraAvance avance={plan.avance_tareas} estado={plan.n_tareas > 0 ? "en_curso" : "sin_datos"} detalle="Actividades hechas sobre el total de la lista de chequeo" />
            {plan.n_tareas_vencidas > 0 && <p className="text-xs font-medium text-red-700">{plan.n_tareas_vencidas} con la fecha límite vencida</p>}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Evidencias</p>
            <p className="text-3xl font-semibold tabular-nums">{plan.n_evidencias}</p>
            <DistintivoEstado estado={estadoGeneral} />
          </div>
        </CardContent>
      </Card>

      {cerrado && puedeEditar && (
        <p className="text-sm text-muted-foreground">El PDA está cerrado y quedó congelado. Para corregir algo, reábrelo.</p>
      )}
      {!cerrado && puedeEditar && plan.n_objetivos > 0 && sinCerrar > 0 && (
        <p className="text-sm text-muted-foreground">
          Al terminar el mes, registra el cierre de cada objetivo (datos finales y % de cumplimiento) y después cierra el PDA.
        </p>
      )}

      {/* Objetivos */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">
            Objetivos <Badge variant="outline">{lista.length}</Badge>
          </h2>
          {editable && <FormularioObjetivo planId={plan.id} siguienteOrden={lista.length} responsablePorDefecto={plan.responsable} />}
        </div>

        {lista.length === 0 ? (
          <EstadoVacio
            icono={<Target />}
            titulo="Este PDA todavía no tiene objetivos"
            descripcion={editable ? "Agrega el primero: el indicador, el análisis y el plan." : "Cuando se agreguen aparecerán aquí."}
          />
        ) : (
          <ul className="space-y-4">
            {lista.map((o, i) => (
              <li key={o.id}>
                <TarjetaObjetivo
                  numero={i + 1}
                  planId={plan.id}
                  objetivo={o}
                  tareas={tareasPor.get(o.id) ?? []}
                  evidencias={evidenciasPor.get(o.id) ?? []}
                  editable={editable}
                  puedeEliminar={puedeEliminar}
                  nombres={nombres}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
