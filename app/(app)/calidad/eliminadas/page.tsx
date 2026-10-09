/**
 * Bitácora de auditorías eliminadas: qué se borró (foto de la auditoría),
 * quién, cuándo y por qué. La ven los administradores y quien puede
 * eliminar; RLS no entrega filas a nadie más.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldAlert, Trash2 } from "lucide-react";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { formatearPorcentaje } from "@/lib/calidad";
import { exigirCalidad } from "@/lib/calidad/acceso";
import { listarAuditoriasEliminadas, puedeEliminarAuditorias } from "@/lib/calidad/datos";
import { formatearFecha, formatearFechaHora } from "@/lib/formato";

export const metadata: Metadata = { title: "Auditorías eliminadas" };

export default async function PaginaEliminadas() {
  const { supabase, perfil } = await exigirCalidad();
  const puedeEliminar = await puedeEliminarAuditorias(supabase);
  if (perfil.rol !== "admin" && !puedeEliminar) notFound();

  const lista = (await listarAuditoriasEliminadas(supabase)) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3 rounded-[20px] border bg-card px-5 py-4">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Cada auditoría eliminada deja aquí una foto de lo que se borró, quién lo hizo, cuándo y el motivo que escribió. Solo
          puede eliminar quien tiene nivel Total en Calidad; este registro no se puede editar ni borrar.
        </p>
      </div>

      {lista.length === 0 ? (
        <EstadoVacio icono={<Trash2 />} titulo="No se ha eliminado ninguna auditoría" descripcion="Cuando se elimine alguna, quedará registrada aquí con su motivo." />
      ) : (
        <ul className="space-y-3">
          {lista.map((x) => (
            <li key={x.id} className="overflow-hidden rounded-[20px] border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-zona/60 px-5 py-3">
                <p className="text-sm">
                  <span className="font-semibold">{x.asesor_nombre}</span>
                  {x.team_leader && <span className="text-muted-foreground"> · {x.team_leader}</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  Eliminada el {formatearFechaHora(x.eliminada_en)} por <span className="font-medium text-foreground">{x.eliminada_por_nombre || "—"}</span>
                </p>
              </div>
              <div className="space-y-3 px-5 py-4">
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">
                  <p className="text-xs font-semibold tracking-[0.1em] text-destructive uppercase">Motivo</p>
                  <p className="mt-0.5 text-sm whitespace-pre-line">{x.motivo}</p>
                </div>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {x.tipo && <span>{x.tipo}</span>}
                  {x.fecha_interaccion && <span>Interacción {formatearFecha(x.fecha_interaccion)}</span>}
                  {x.fecha_auditoria && <span>Auditada {formatearFecha(x.fecha_auditoria)}</span>}
                  {x.analista_nombre && <span>por {x.analista_nombre}</span>}
                  <span>
                    Nota {formatearPorcentaje(x.nota_final === null ? null : Number(x.nota_final))}
                    {x.nota_importada !== null && ` (formulario ${formatearPorcentaje(Number(x.nota_importada))})`}
                  </span>
                  <span>{x.n_respuestas} ítems marcados</span>
                  <Badge variant="outline" className="text-[11px]">
                    {x.estado === "publicada" ? "Estaba publicada" : "Era borrador"}
                  </Badge>
                  {x.tenia_retro && (
                    <Badge variant="secondary" className="text-[11px]">
                      Tenía retroalimentación
                    </Badge>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
