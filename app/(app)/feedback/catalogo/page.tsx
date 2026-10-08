// El catálogo de tipos y subtipos de feedback (documento Tipos y Subtipos de
// Feedback), como referencia. Lectura para quien tiene el cuadro.
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { exigirModulo } from "@/lib/modulos-acceso";
import type { CatalogoFeedback } from "@/lib/supabase/tipos";

export const metadata: Metadata = { title: "Catálogo de feedback" };

export default async function PaginaCatalogoFeedback() {
  const { supabase } = await exigirModulo("feedback");
  const { data } = await supabase.from("feedback_catalogo").select("*").eq("activo", true).order("orden");
  const catalogo = data ?? [];
  if (catalogo.length === 0) return <EstadoVacio titulo="El catálogo está vacío" descripcion="Se carga con la migración del módulo." />;

  // Agrupar por tipo → subtipo.
  const porTipo = new Map<string, Map<string, CatalogoFeedback[]>>();
  for (const c of catalogo) {
    if (!porTipo.has(c.tipo)) porTipo.set(c.tipo, new Map());
    const subs = porTipo.get(c.tipo)!;
    subs.set(c.subtipo, [...(subs.get(c.subtipo) ?? []), c]);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Tipos, subtipos y detalles de feedback que se pueden registrar. El tipo de liderazgo y equipo solo lo registran dirección o gerencia.
      </p>
      {[...porTipo.entries()].map(([tipo, subs]) => {
        const soloDir = [...subs.values()].flat().some((c) => c.solo_direccion);
        return (
          <section key={tipo} className="space-y-3">
            <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {tipo}
              {soloDir && <Badge variant="secondary">Solo dirección / gerencia</Badge>}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {[...subs.entries()].map(([subtipo, items]) => (
                <div key={subtipo} className="rounded-[18px] border bg-card p-4">
                  <p className="text-xs font-semibold tracking-[0.1em] text-atenuado uppercase">{subtipo}</p>
                  <ul className="mt-2 space-y-1.5">
                    {items.map((c) => (
                      <li key={c.id} className="flex items-start gap-2 text-sm">
                        <span className={`mt-1 size-1.5 shrink-0 rounded-full ${c.es_positivo ? "bg-emerald-500" : "bg-primary/60"}`} aria-hidden />
                        <span>
                          {c.detalle}
                          {c.es_positivo && (
                            <Badge variant="outline" className="ml-1 border-emerald-300 text-emerald-700 align-middle">
                              reconocimiento
                            </Badge>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
