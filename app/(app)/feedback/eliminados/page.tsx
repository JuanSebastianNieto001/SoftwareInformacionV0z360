/**
 * Bitácora de feedback eliminado: qué se borró (foto del feedback), quién,
 * cuándo y por qué. La ven los administradores y quien puede eliminar; RLS
 * no entrega filas a nadie más.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldAlert, Trash2 } from "lucide-react";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { formatearFecha, formatearFechaHora } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos-acceso";

export const metadata: Metadata = { title: "Feedback eliminado" };

export default async function PaginaFeedbackEliminado() {
  const { supabase, perfil } = await exigirModulo("feedback");
  const { data: puedeEliminar } = await supabase.rpc("feedback_puede_eliminar");
  if (perfil.rol !== "admin" && !puedeEliminar) notFound();

  const { data } = await supabase.from("feedback_eliminaciones").select("*").order("eliminado_en", { ascending: false }).limit(500);
  const lista = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3 rounded-[20px] border bg-card px-5 py-4">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Cada feedback eliminado deja aquí una foto de lo que se borró, quién lo hizo, cuándo y el motivo que escribió. Solo puede
          eliminar quien tiene nivel Total en Feedback; este registro no se puede editar ni borrar.
        </p>
      </div>

      {lista.length === 0 ? (
        <EstadoVacio icono={<Trash2 />} titulo="No se ha eliminado ningún feedback" descripcion="Cuando se elimine alguno, quedará registrado aquí con su motivo." />
      ) : (
        <ul className="space-y-3">
          {lista.map((x) => (
            <li key={x.id} className="overflow-hidden rounded-[20px] border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-zona/60 px-5 py-3">
                <p className="text-sm">
                  <span className="font-semibold">{x.colaborador_nombre}</span>
                  {x.team_leader && <span className="text-muted-foreground"> · {x.team_leader}</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  Eliminado el {formatearFechaHora(x.eliminado_en)} por <span className="font-medium text-foreground">{x.eliminado_por_nombre || "—"}</span>
                </p>
              </div>
              <div className="space-y-3 px-5 py-4">
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">
                  <p className="text-xs font-semibold tracking-[0.1em] text-destructive uppercase">Motivo</p>
                  <p className="mt-0.5 text-sm whitespace-pre-line">{x.motivo}</p>
                </div>
                {(x.tipo || x.detalle) && (
                  <p className="text-sm">
                    <span className="text-xs text-muted-foreground">
                      {x.tipo} · {x.subtipo} ·{" "}
                    </span>
                    {x.detalle}
                  </p>
                )}
                {x.descripcion && <p className="line-clamp-3 text-sm text-muted-foreground">{x.descripcion}</p>}
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {x.fecha && <span>Hecho del {formatearFecha(`${x.fecha}T12:00:00-05:00`)}</span>}
                  {x.registrado_por_nombre && <span>Registrado por {x.registrado_por_nombre}</span>}
                  {x.gravedad && <span>Gravedad {x.gravedad}</span>}
                  {x.estado && <span>Estado {x.estado.replace("_", " ")}</span>}
                  <Badge variant="outline" className="text-[11px]">
                    {x.conformidad ? "Estaba firmado" : "Sin firma"}
                  </Badge>
                  {x.compromiso && (
                    <Badge variant="secondary" className="text-[11px]">
                      Tenía compromiso
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
