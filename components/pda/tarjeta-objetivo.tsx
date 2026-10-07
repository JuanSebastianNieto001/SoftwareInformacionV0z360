// Un objetivo del PDA: la fila de la matriz con su estado, la lista de
// chequeo y las evidencias. Componente de servidor; lo interactivo son sus
// hijos.
import { eliminarObjetivo } from "@/app/acciones/pda";
import { BotonEliminar } from "@/components/comunes/boton-eliminar";
import { BarraAvance, DistintivoEstado } from "@/components/pda/avance";
import { Evidencias } from "@/components/pda/evidencias";
import { FormularioCierre } from "@/components/pda/formulario-cierre";
import { FormularioObjetivo } from "@/components/pda/formulario-objetivo";
import { ListaChequeo } from "@/components/pda/lista-chequeo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatearFecha } from "@/lib/formato";
import { estadoObjetivo, porcentaje } from "@/lib/pda";
import type { EvidenciaPda, ObjetivoPda, TareaPda } from "@/lib/supabase/tipos";

function Bloque({ titulo, texto }: { titulo: string; texto: string | null }) {
  if (!texto) return null;
  return (
    <div>
      <dt className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{titulo}</dt>
      <dd className="mt-0.5 text-sm whitespace-pre-line">{texto}</dd>
    </div>
  );
}

export function TarjetaObjetivo({
  numero,
  planId,
  objetivo,
  tareas,
  evidencias,
  editable,
  puedeEliminar,
  nombres,
}: {
  numero: number;
  planId: string;
  objetivo: ObjetivoPda;
  tareas: TareaPda[];
  evidencias: EvidenciaPda[];
  /** Edición y PDA abierto. */
  editable: boolean;
  puedeEliminar: boolean;
  nombres: Record<string, string>;
}) {
  const estado = estadoObjetivo(objetivo.cumplimiento);
  const cerrado = objetivo.cumplimiento !== null;

  return (
    <Card id={`objetivo-${numero}`} className="scroll-mt-24 rounded-[20px]">
      <CardContent className="space-y-4 px-[22px] py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">
              Objetivo {numero}
              {objetivo.frente && <Badge variant="outline">{objetivo.frente}</Badge>}
            </p>
            <h3 className="mt-1 text-[15px] leading-snug font-semibold">{objetivo.indicador}</h3>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {objetivo.fecha_inicial && <span>Desde {formatearFecha(`${objetivo.fecha_inicial}T12:00:00-05:00`)}</span>}
              {objetivo.responsable && <span>{objetivo.responsable}</span>}
              <span>Proyección {porcentaje(objetivo.proyeccion)}</span>
            </p>
          </div>
          <div className="flex items-center gap-1">
            {editable && <FormularioCierre planId={planId} objetivo={objetivo} />}
            {editable && <FormularioObjetivo planId={planId} objetivo={objetivo} />}
            {puedeEliminar && editable && (
              <BotonEliminar
                compacto
                accion={eliminarObjetivo.bind(null, objetivo.id, planId)}
                titulo={`Eliminar el objetivo ${numero}`}
                descripcion="Se borran el objetivo, su lista de chequeo y sus evidencias. No se puede deshacer."
              />
            )}
          </div>
        </div>

        {/* Estado y avance */}
        <div className="grid items-center gap-3 rounded-xl bg-muted/40 px-4 py-3 sm:grid-cols-[auto_1fr_auto]">
          <DistintivoEstado estado={estado} />
          <BarraAvance
            avance={cerrado ? Number(objetivo.cumplimiento) : objetivo.avance_tareas}
            estado={cerrado ? estado : objetivo.n_tareas > 0 ? "en_curso" : "sin_datos"}
            detalle={
              cerrado
                ? `Cumplimiento registrado: ${porcentaje(objetivo.cumplimiento)}`
                : objetivo.n_tareas > 0
                  ? `Actividades: ${objetivo.n_tareas_hechas} de ${objetivo.n_tareas}`
                  : "Sin actividades ni cierre"
            }
          />
          <p className="text-xs text-muted-foreground tabular-nums">
            {cerrado ? "cumplimiento" : objetivo.n_tareas > 0 ? `${objetivo.n_tareas_hechas}/${objetivo.n_tareas} actividades` : "sin actividades"}
            {objetivo.n_tareas_vencidas > 0 && !cerrado && (
              <span className="ml-2 font-medium text-red-700">{objetivo.n_tareas_vencidas} vencida{objetivo.n_tareas_vencidas === 1 ? "" : "s"}</span>
            )}
          </p>
        </div>

        {/* Cierre, si existe */}
        {(objetivo.datos_cierre || cerrado || objetivo.observacion) && (
          <dl className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 sm:grid-cols-2">
            <Bloque titulo="Datos al final de mes" texto={objetivo.datos_cierre} />
            <Bloque titulo="Observación" texto={objetivo.observacion} />
          </dl>
        )}

        {/* La fila completa de la matriz */}
        <details className="group rounded-xl border px-4 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none">
            Ver la fila completa de la matriz (objetivo, causa raíz, qué, cómo, recursos, periodicidad)
          </summary>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Bloque titulo="Indicador del mes anterior" texto={objetivo.indicador_anterior} />
            <Bloque titulo="Objetivo (cualitativo)" texto={objetivo.objetivo} />
            <Bloque titulo="Análisis de causa raíz" texto={objetivo.causa_raiz} />
            <Bloque titulo="¿Qué se hará?" texto={objetivo.que_se_hara} />
            <Bloque titulo="¿Cómo se hará?" texto={objetivo.como_se_hara} />
            <Bloque titulo="¿Con qué recursos?" texto={objetivo.recursos} />
            <Bloque titulo="Periodicidad" texto={objetivo.periodicidad} />
          </dl>
        </details>

        <div className="grid gap-4 lg:grid-cols-2">
          <ListaChequeo planId={planId} objetivoId={objetivo.id} tareas={tareas} editable={editable} nombres={nombres} />
          <Evidencias planId={planId} objetivoId={objetivo.id} evidencias={evidencias} editable={editable} nombres={nombres} />
        </div>
      </CardContent>
    </Card>
  );
}
