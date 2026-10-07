// PDA: los planes del mes en curso (uno por cargo) arriba y el histórico
// de todos los meses debajo, con su cumplimiento.
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Lock, Paperclip, Target } from "lucide-react";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { BarraAvance, DistintivoEstado, type EstadoVisual } from "@/components/pda/avance";
import { FormularioPlan } from "@/components/pda/formulario-plan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirModulo } from "@/lib/modulos-acceso";
import { CARGOS_PDA, estadoObjetivo, mesActual, nombreMes, porcentaje } from "@/lib/pda";
import type { PlanPda } from "@/lib/supabase/tipos";

export const metadata: Metadata = { title: "PDA" };

/** Estado visible de un PDA: por el cumplimiento registrado si lo hay; si no, por las actividades. */
function estadoPlan(p: PlanPda): EstadoVisual {
  if (p.n_objetivos === 0) return "sin_datos";
  if (p.cumplimiento !== null) return estadoObjetivo(p.cumplimiento);
  return p.n_tareas > 0 ? "en_curso" : "sin_datos";
}

function etiquetaPlan(p: PlanPda): string {
  if (p.n_objetivos === 0) return "Sin objetivos";
  if (p.cumplimiento !== null) {
    const pendientes = p.n_objetivos - p.n_objetivos_cerrados;
    const base = `${porcentaje(p.cumplimiento)} de cumplimiento`;
    return pendientes > 0 ? `${base} · ${pendientes} sin cerrar` : base;
  }
  return p.n_tareas > 0 ? `${p.n_tareas_hechas} de ${p.n_tareas} actividades` : "En curso";
}

export default async function PaginaPda() {
  const { supabase, puedeEditar, perfil } = await exigirModulo("pda");

  const { data: planes, error } = await supabase.from("v_pda_planes").select("*").order("periodo", { ascending: false }).order("cargo").limit(240);

  const todos = planes ?? [];
  const mes = mesActual();
  const delMes = todos.filter((p) => p.periodo.startsWith(mes));
  const cargosSinPlan = CARGOS_PDA.filter((c) => !delMes.some((p) => p.cargo === c));
  const cerrados = todos.filter((p) => p.estado === "cerrado" && p.cumplimiento !== null);
  const promedioCerrados = cerrados.length ? cerrados.reduce((s, p) => s + Number(p.cumplimiento), 0) / cerrados.length : null;

  return (
    <div className="space-y-8">
      {error && <EstadoVacio titulo="No se pudo cargar el PDA" descripcion={error.message} />}

      {/* El mes en curso */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">Mes en curso · {nombreMes(`${mes}-01`)}</h2>
          {puedeEditar && <FormularioPlan sugerencia={{ responsable: perfil.nombre }} />}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {delMes.map((p) => {
            const estado = estadoPlan(p);
            return (
              <Card key={p.id} className="rounded-[20px]">
                <CardContent className="space-y-3 px-[22px] py-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold tracking-[0.08em] text-primary uppercase">{p.cargo}</p>
                      <h3 className="mt-0.5 text-lg leading-snug font-semibold">{p.titulo}</h3>
                      <p className="text-sm text-muted-foreground">{p.responsable}</p>
                    </div>
                    {p.estado === "cerrado" && (
                      <Badge variant="secondary">
                        <Lock /> Cerrado
                      </Badge>
                    )}
                  </div>
                  <BarraAvance
                    avance={p.cumplimiento !== null ? p.cumplimiento : p.avance_tareas}
                    estado={estado}
                    detalle={etiquetaPlan(p)}
                  />
                  <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      {p.n_objetivos} objetivo{p.n_objetivos === 1 ? "" : "s"}
                    </span>
                    <span>
                      {p.n_tareas_hechas}/{p.n_tareas} actividades
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Paperclip className="size-3.5" aria-hidden /> {p.n_evidencias}
                    </span>
                    {p.n_tareas_vencidas > 0 && <span className="font-medium text-red-700">{p.n_tareas_vencidas} vencidas</span>}
                  </p>
                  <Button asChild>
                    <Link href={`/pda/${p.id}`}>
                      {puedeEditar && p.estado === "abierto" ? "Abrir y actualizar" : "Ver el PDA"} <ChevronRight />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
          {cargosSinPlan.map((cargo) => (
            <Card key={cargo} className="rounded-[20px] border-dashed">
              <CardContent className="flex h-full flex-col justify-between gap-3 px-[22px] py-5">
                <div>
                  <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{cargo}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Todavía no hay PDA de {cargo} para {nombreMes(`${mes}-01`).toLowerCase()}.</p>
                </div>
                {puedeEditar && <FormularioPlan compacto sugerencia={{ cargo, mes }} />}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Histórico */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">
            Histórico <Badge variant="outline">{todos.length}</Badge>
          </h2>
          {promedioCerrados !== null && (
            <p className="text-sm text-muted-foreground">
              Promedio de los {cerrados.length} PDA cerrados: <span className="font-semibold text-foreground tabular-nums">{porcentaje(promedioCerrados)}</span>
            </p>
          )}
        </div>

        {todos.length === 0 && !error ? (
          <EstadoVacio
            icono={<Target />}
            titulo="Todavía no hay PDA registrados"
            descripcion={puedeEditar ? "Crea el del mes con el botón de arriba." : "Cuando el líder de TI registre el PDA aparecerá aquí."}
          />
        ) : (
          <div className="overflow-x-auto rounded-[20px] border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead>PDA</TableHead>
                  <TableHead className="text-right">Objetivos</TableHead>
                  <TableHead className="text-right">Actividades</TableHead>
                  <TableHead className="text-right">Evidencias</TableHead>
                  <TableHead className="min-w-44">Cumplimiento</TableHead>
                  <TableHead>Estado</TableHead>
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
                          <span className="font-medium">{p.cargo}</span>
                          <span className="block text-xs text-muted-foreground">{p.titulo}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.n_objetivos_cerrados}/{p.n_objetivos}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.n_tareas_hechas}/{p.n_tareas}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.n_evidencias}</TableCell>
                      <TableCell>
                        <BarraAvance avance={p.cumplimiento !== null ? p.cumplimiento : p.avance_tareas} estado={estado} detalle={etiquetaPlan(p)} />
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-2">
                          <DistintivoEstado estado={estado} />
                          {p.estado === "cerrado" ? (
                            <Badge variant="secondary">Cerrado</Badge>
                          ) : (
                            <Badge variant="outline">Abierto</Badge>
                          )}
                        </span>
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
          El cumplimiento de un PDA es el promedio del % de cumplimiento registrado en sus objetivos al cierre (columna M del formato).
          Mientras el mes está en curso la barra muestra las actividades hechas sobre el total.
        </p>
      </section>
    </div>
  );
}
