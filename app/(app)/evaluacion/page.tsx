// Dashboard y resumen del módulo de evaluación, por periodo.
import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  COMPETENCIAS_360,
  ETIQUETA_PERSPECTIVA,
  conformidadGeneral,
  cumplimiento,
  estadoIso,
  formatearNota,
  media,
  nivelCompetencia,
  nivelDashboard,
  varianteNota,
} from "@/lib/evaluacion";
import {
  listarCargosActivosConArea,
  listarEvaluacionesDelPeriodo,
  listarPeriodos,
  listarPromedios360,
  listarResultadosDeEvaluaciones,
} from "@/lib/evaluacion/datos";
import { exigirModulo } from "@/lib/modulos-acceso";
import { cn } from "@/lib/utils";
import { PERSPECTIVAS_360 } from "@/lib/validaciones";

export const metadata: Metadata = { title: "Evaluación de desempeño" };

const anioActual = () => String(new Date().getFullYear());

/**
 * Las hojas "Dashboard" y "Resumen General" del libro, en una pantalla.
 *
 * Una diferencia deliberada con el Excel: allí cada cargo tiene UNA hoja,
 * así que el promedio general incluye con 0 a los cargos sin evaluar
 * (por eso el libro muestra 0,31). Aquí un cargo puede tener varias
 * evaluaciones por periodo y el promedio general se calcula solo sobre los
 * cargos que tienen alguna; se indica cuántos son.
 */
export default async function PaginaDashboardEvaluacion({
  searchParams,
}: PageProps<"/evaluacion">) {
  const sp = await searchParams;
  const { supabase, puedeEditar } = await exigirModulo("evaluacion");

  const periodoParam = typeof sp.periodo === "string" ? sp.periodo.trim() : "";
  const periodo = periodoParam || anioActual();
  const todos = periodo === "todos";
  const esAnio = /^\d{4}$/.test(periodo);

  const [cargos, evaluaciones, periodos, respuestas] = await Promise.all([
    listarCargosActivosConArea(supabase),
    listarEvaluacionesDelPeriodo(supabase, todos ? null : periodo),
    listarPeriodos(supabase),
    listarPromedios360(supabase, esAnio ? periodo : null),
  ]);

  const resultados = await listarResultadosDeEvaluaciones(
    supabase,
    evaluaciones.map((e) => e.id),
  );
  const resultadoPorId = new Map(resultados.map((r) => [r.evaluacion_id, r]));

  if (!periodos.includes(anioActual())) periodos.unshift(anioActual());

  // ---- Dashboard: una fila por cargo (E7..K21) ----
  const filas = cargos.map((c) => {
    const propias = evaluaciones
      .filter((e) => e.cargo_id === c.id)
      .map((e) => resultadoPorId.get(e.id))
      .filter((r): r is NonNullable<typeof r> => !!r);
    const nota = media(propias.map((r) => r.nota_final));
    return {
      ...c,
      n: propias.length,
      autoevaluacion: media(propias.map((r) => r.autoevaluacion)),
      jefe_inmediato: media(propias.map((r) => r.jefe_inmediato)),
      pares: media(propias.map((r) => r.pares)),
      subordinados: media(propias.map((r) => r.subordinados)),
      nota,
    };
  });
  const evaluados = filas.filter((f) => f.n > 0);
  const general = {
    autoevaluacion: media(evaluados.map((f) => f.autoevaluacion)),
    jefe_inmediato: media(evaluados.map((f) => f.jefe_inmediato)),
    pares: media(evaluados.map((f) => f.pares)),
    subordinados: media(evaluados.map((f) => f.subordinados)),
    nota: media(evaluados.map((f) => f.nota)),
  };
  const conformidad = conformidadGeneral(general.nota);

  // ---- Resumen General: lo que sale de la matriz 360 ----
  const promedioGlobal = media(respuestas.map((r) => r.promedio));
  const porPerspectiva = PERSPECTIVAS_360.map((p) => {
    const propias = respuestas.filter((r) => r.perspectiva === p);
    return { perspectiva: p, n: propias.length, promedio: media(propias.map((r) => r.promedio)) };
  });
  const porCompetencia = COMPETENCIAS_360.map((c) => ({
    ...c,
    promedio: media(respuestas.map((r) => r[c.clave])),
  }));

  const hayDatos = evaluados.length > 0 || respuestas.length > 0;

  return (
    <div className="space-y-8">
      {/* Periodo */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Periodo:</span>
        {[...periodos, "todos"].map((p) => (
          <Link
            key={p}
            href={p === anioActual() ? "/evaluacion" : `/evaluacion?periodo=${encodeURIComponent(p)}`}
            className={cn(
              "rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
              p === periodo
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-nav-inactivo hover:border-borde-acento hover:text-primary",
            )}
          >
            {p === "todos" ? "Todos" : p}
          </Link>
        ))}
        {puedeEditar && (
          <Button asChild className="ml-auto">
            <Link href="/evaluacion/formatos/nueva">
              <ClipboardList /> Nueva evaluación
            </Link>
          </Button>
        )}
      </div>

      {!hayDatos && (
        <EstadoVacio
          icono={<ClipboardList />}
          titulo={todos ? "Todavía no hay evaluaciones" : `Sin evaluaciones en ${periodo}`}
          descripcion={
            puedeEditar
              ? "Crea la primera desde «Nueva evaluación» o registra respuestas en la matriz 360."
              : "Cuando se registren evaluaciones, el dashboard se calcula solo."
          }
        />
      )}

      {/* Indicadores generales (B6, C6, D6 del Resumen y fila 22 del Dashboard) */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          etiqueta="Nota final 360°"
          valor={formatearNota(general.nota)}
          detalle={`${evaluados.length} de ${filas.length} cargos evaluados`}
        />
        <Indicador
          etiqueta="Cumplimiento de metas"
          valor={cumplimiento(general.nota)}
          detalle="Nota final sobre 5"
        />
        <Indicador
          etiqueta="Promedio global matriz 360"
          valor={formatearNota(promedioGlobal)}
          detalle={`${respuestas.length} ${respuestas.length === 1 ? "respuesta" : "respuestas"}`}
        />
        <Indicador
          etiqueta="Estado general"
          valor={conformidad ? conformidad.dashboard : "—"}
          detalle={conformidad ? conformidad.iso : "Sin datos"}
          tono={conformidad ? (conformidad.conforme ? "bien" : "alerta") : "neutro"}
        />
      </section>

      {/* Dashboard por cargo */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">
          Compendio ejecutivo de cargos
        </h2>
        <div className="overflow-x-auto rounded-[20px] border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Área / departamento</TableHead>
                <TableHead className="text-right">Evals.</TableHead>
                <TableHead className="text-right">Autoeval. (10 %)</TableHead>
                <TableHead className="text-right">Jefe (40 %)</TableHead>
                <TableHead className="text-right">Pares (25 %)</TableHead>
                <TableHead className="text-right">Subord. (25 %)</TableHead>
                <TableHead className="text-right">Nota final 360°</TableHead>
                <TableHead>Nivel de desempeño</TableHead>
                <TableHead>Estado ISO / SIG</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.id} className={f.n === 0 ? "text-muted-foreground" : undefined}>
                  <TableCell className="font-mono text-xs">{f.codigo}</TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/evaluacion/formatos?cargo=${f.id}${todos ? "" : `&periodo=${encodeURIComponent(periodo)}`}`}
                      className="hover:text-primary hover:underline"
                    >
                      {f.nombre}
                    </Link>
                  </TableCell>
                  <TableCell>{f.area_departamento}</TableCell>
                  <TableCell className="text-right tabular-nums">{f.n}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatearNota(f.autoevaluacion)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatearNota(f.jefe_inmediato)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatearNota(f.pares)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatearNota(f.subordinados)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatearNota(f.nota)}</TableCell>
                  <TableCell>
                    {f.n > 0 ? (
                      <Badge variant={varianteNota(f.nota)}>{nivelDashboard(f.nota)}</Badge>
                    ) : (
                      <span className="text-xs">Sin datos</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs font-semibold">{f.n > 0 ? estadoIso(f.nota) : "—"}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-zona/60 font-semibold">
                <TableCell colSpan={3}>PROMEDIO GENERAL VOZ 360°</TableCell>
                <TableCell className="text-right tabular-nums">
                  {evaluados.reduce((a, f) => a + f.n, 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatearNota(general.autoevaluacion)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatearNota(general.jefe_inmediato)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatearNota(general.pares)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatearNota(general.subordinados)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatearNota(general.nota)}</TableCell>
                <TableCell>{conformidad?.dashboard ?? "—"}</TableCell>
                <TableCell className="text-xs">{conformidad?.iso ?? "—"}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          Cada columna de perspectiva es el promedio de las calificaciones de esa perspectiva; la nota
          final es el promedio ponderado (10 / 40 / 25 / 25 %). El promedio general se calcula sobre los
          cargos con alguna evaluación en el periodo.
        </p>
      </section>

      {/* Resumen General: perspectivas y competencias (matriz 360) */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">
            Por perspectiva 360° (matriz)
          </h2>
          <div className="overflow-x-auto rounded-[20px] border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Perspectiva</TableHead>
                  <TableHead className="text-right">Respuestas</TableHead>
                  <TableHead className="text-right">Promedio</TableHead>
                  <TableHead className="text-right">Cumplimiento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {porPerspectiva.map((p) => (
                  <TableRow key={p.perspectiva}>
                    <TableCell>{ETIQUETA_PERSPECTIVA[p.perspectiva]}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.n}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatearNota(p.promedio)}</TableCell>
                    <TableCell className="text-right tabular-nums">{cumplimiento(p.promedio)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">
            Por competencia evaluada (matriz)
          </h2>
          <div className="overflow-x-auto rounded-[20px] border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competencia</TableHead>
                  <TableHead className="text-right">Promedio global (1–5)</TableHead>
                  <TableHead>Nivel de dominio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {porCompetencia.map((c) => (
                  <TableRow key={c.clave}>
                    <TableCell>{c.nombre}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatearNota(c.promedio)}</TableCell>
                    <TableCell>
                      {c.promedio !== null ? (
                        <Badge variant={varianteNota(c.promedio)}>{nivelCompetencia(c.promedio)}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin datos</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>
    </div>
  );
}

function Indicador({
  etiqueta,
  valor,
  detalle,
  tono = "neutro",
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  tono?: "neutro" | "bien" | "alerta";
}) {
  return (
    <Card className="rounded-[20px]">
      <CardContent className="px-[18px] py-4">
        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{etiqueta}</p>
        <p
          className={cn(
            "mt-1 text-[26px] leading-tight font-semibold tabular-nums",
            tono === "bien" && "text-emerald-700",
            tono === "alerta" && "text-destructive",
          )}
        >
          {valor}
        </p>
        {detalle && <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>}
      </CardContent>
    </Card>
  );
}
