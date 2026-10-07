// Política de penalización de los errores críticos (hoja Penalización de la
// matriz): gravedad, tratamiento en la 1.ª y la 2.ª ocurrencia e impacto en
// comisiones. Es referencia que acompaña a la retroalimentación; no calcula
// nada ni guarda datos de personas.
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PenalizacionCalidad } from "@/lib/supabase/tipos";

function varianteGravedad(g: string): "destructive" | "secondary" | "outline" {
  const t = g.toLowerCase();
  if (t.includes("muy grave")) return "destructive";
  if (t.includes("moderada")) return "secondary";
  return "outline";
}

export function TablaPenalizacion({ filas }: { filas: PenalizacionCalidad[] }) {
  if (filas.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">Matriz de penalización de errores críticos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Guía de consecuencias cuando falla un ítem de tolerancia cero. Acompaña a la retroalimentación; no cambia la nota.
        </p>
      </div>
      <div className="overflow-x-auto rounded-[20px] border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Error crítico</TableHead>
              <TableHead>Gravedad</TableHead>
              <TableHead>1.ª ocurrencia</TableHead>
              <TableHead>2.ª ocurrencia (reincidencia)</TableHead>
              <TableHead>Comisión</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="align-top">
                  <span className="font-medium">{p.item_critico}</span>
                  {p.variante && <span className="block text-xs text-primary">{p.variante}</span>}
                  {p.pauta_evaluada && <span className="mt-0.5 block text-xs text-muted-foreground">{p.pauta_evaluada}</span>}
                </TableCell>
                <TableCell className="align-top">
                  <Badge variant={varianteGravedad(p.gravedad)}>{p.gravedad}</Badge>
                </TableCell>
                <TableCell className="align-top text-sm">{p.tratamiento_primera}</TableCell>
                <TableCell className="align-top text-sm">{p.tratamiento_segunda ?? "—"}</TableCell>
                <TableCell className="align-top text-sm whitespace-nowrap">{p.impacto_comisiones ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
