// PDA: el mes en curso arriba y el histórico de todos los meses debajo, con
// el cumplimiento de cada uno.
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Target } from "lucide-react";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { BarraAvance, DistintivoMeta, type EstadoMeta } from "@/components/pda/avance";
import { FormularioPlan } from "@/components/pda/formulario-plan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirModulo } from "@/lib/modulos-acceso";
import { mesActual, nombreMes, porcentaje } from "@/lib/pda";
import type { PlanPda } from "@/lib/supabase/tipos";

export const metadata: Metadata = { title: "PDA" };

/** Veredicto de un mes: cumplido solo si todos sus indicadores cumplen. */
function estadoPlan(p: PlanPda): EstadoMeta {
  if (p.indicadores === 0 || p.medidos === 0) return "sin_medir";
  if (p.meta_alcanzada) return "cumple";
  return p.estado === "cerrado" ? "no_cumple" : "en_curso";
}

const ETIQUETA_PLAN: Record<EstadoMeta, string> = {
  cumple: "Meta alcanzada",
  en_curso: "En curso",
  no_cumple: "Meta no alcanzada",
  sin_medir: "Sin medir",
};

export default async function PaginaPda() {
  const { supabase, puedeEditar } = await exigirModulo("pda");

  const { data: planes, error } = await supabase
    .from("v_pda_planes")
    .select("*")
    .order("periodo", { ascending: false })
    .limit(120);

  const todos = planes ?? [];
  const actual = todos.find((p) => p.periodo.startsWith(mesActual())) ?? null;
  const cerrados = todos.filter((p) => p.estado === "cerrado" && p.indicadores > 0);
  const alcanzados = cerrados.filter((p) => p.meta_alcanzada).length;

  return (
    <div className="space-y-8">
      {error && <EstadoVacio titulo="No se pudo cargar el PDA" descripcion={error.message} />}

      {/* El mes en curso */}
      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="rounded-[20px]">
          <CardContent className="space-y-3 px-[22px] py-5">
            <p className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">
              Mes en curso · {nombreMes(`${mesActual()}-01`)}
            </p>
            {actual ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">{actual.titulo}</h2>
                  <DistintivoMeta estado={estadoPlan(actual)} etiqueta={ETIQUETA_PLAN[estadoPlan(actual)]} />
                </div>
                <BarraAvance
                  avance={actual.indicadores > 0 ? actual.cumplimiento : null}
                  estado={estadoPlan(actual)}
                  detalle={`Cumplimiento ponderado ${porcentaje(actual.cumplimiento)}`}
                />
                <p className="text-sm text-muted-foreground">
                  {actual.cumplen} de {actual.indicadores} indicadores cumplen · {actual.medidos} medidos
                </p>
                <Button asChild>
                  <Link href={`/pda/${actual.id}`}>
                    {puedeEditar ? "Abrir y medir" : "Ver indicadores"} <ChevronRight />
                  </Link>
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Todavía no hay PDA para este mes.</p>
                {puedeEditar && <FormularioPlan />}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[20px]">
          <CardContent className="space-y-1 px-[22px] py-5">
            <p className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">Meses cerrados</p>
            <p className="text-4xl font-semibold tabular-nums">
              {alcanzados}
              <span className="text-lg text-muted-foreground"> / {cerrados.length}</span>
            </p>
            <p className="text-sm text-muted-foreground">con la meta alcanzada en todos sus indicadores</p>
          </CardContent>
        </Card>
      </section>

      {/* Histórico */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">
            Histórico <Badge variant="outline">{todos.length}</Badge>
          </h2>
          {puedeEditar && actual && <FormularioPlan />}
        </div>

        {todos.length === 0 && !error ? (
          <EstadoVacio
            icono={<Target />}
            titulo="Todavía no hay PDA registrados"
            descripcion={
              puedeEditar ? "Crea el del mes con el botón de arriba." : "Cuando el líder de TI registre el PDA aparecerá aquí."
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-[20px] border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead>PDA</TableHead>
                  <TableHead className="text-right">Cumplen</TableHead>
                  <TableHead className="min-w-48">Cumplimiento</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {todos.map((p) => {
                  const estado = estadoPlan(p);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium whitespace-nowrap">{nombreMes(p.periodo)}</TableCell>
                      <TableCell>
                        <Link href={`/pda/${p.id}`} className="hover:underline">
                          {p.titulo}
                        </Link>
                        {p.estado === "abierto" && (
                          <Badge variant="outline" className="ml-2">
                            Abierto
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.cumplen} / {p.indicadores}
                      </TableCell>
                      <TableCell>
                        <BarraAvance
                          avance={p.indicadores > 0 ? p.cumplimiento : null}
                          estado={estado}
                          detalle={`${nombreMes(p.periodo)}: ${porcentaje(p.cumplimiento)} · ${p.cumplen} de ${p.indicadores} indicadores cumplen`}
                        />
                      </TableCell>
                      <TableCell>
                        <DistintivoMeta estado={estado} etiqueta={ETIQUETA_PLAN[estado]} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="icon-sm" aria-label={`Abrir ${p.titulo}`}>
                          <Link href={`/pda/${p.id}`}>
                            <ChevronRight />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          El cumplimiento es el promedio ponderado del avance de cada indicador frente a su meta, topado en 100 % por
          indicador; los no medidos cuentan como 0. Un mes alcanza la meta cuando todos sus indicadores cumplen.
        </p>
      </section>
    </div>
  );
}
