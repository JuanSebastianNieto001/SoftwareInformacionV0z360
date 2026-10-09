// Listado de evaluaciones por cargo, con filtros por cargo, periodo y estado.
import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Filter } from "lucide-react";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ETIQUETA_ESTADO_EVALUACION,
  formatearNota,
  nivelFormato,
  varianteNota,
} from "@/lib/evaluacion";
import {
  listarEvaluaciones,
  listarNotasDeEvaluaciones,
  listarPeriodos,
  listarTodosLosCargos,
} from "@/lib/evaluacion/datos";
import { exigirModulo } from "@/lib/modulos-acceso";
import { formatearFecha } from "@/lib/formato";
import { ESTADOS_EVALUACION } from "@/lib/validaciones";
import type { EstadoEvaluacion } from "@/lib/supabase/tipos";

export const metadata: Metadata = { title: "Formatos por cargo" };

const SELECT =
  "h-[40px] rounded-lg border-[1.5px] border-input bg-campo px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-ring/20";

/** El listado de hojas de cargo: una fila por evaluación hecha. */
export default async function PaginaFormatos({ searchParams }: PageProps<"/evaluacion/formatos">) {
  const sp = await searchParams;
  const { supabase, puedeEditar } = await exigirModulo("evaluacion");

  const cargoId = typeof sp.cargo === "string" ? sp.cargo : "";
  const periodo = typeof sp.periodo === "string" ? sp.periodo.trim() : "";
  const estadoParam = typeof sp.estado === "string" ? sp.estado : "";
  const estado = (ESTADOS_EVALUACION as readonly string[]).includes(estadoParam)
    ? (estadoParam as EstadoEvaluacion)
    : "";

  const [cargos, { evaluaciones, error }, periodos] = await Promise.all([
    listarTodosLosCargos(supabase),
    listarEvaluaciones(supabase, { cargoId, periodo, estado }),
    listarPeriodos(supabase),
  ]);

  const resultados = await listarNotasDeEvaluaciones(
    supabase,
    evaluaciones.map((e) => e.id),
  );
  const resultadoPorId = new Map(resultados.map((r) => [r.evaluacion_id, r]));
  const nombreCargo = new Map(cargos.map((c) => [c.id, c.nombre]));
  const hayFiltro = !!(cargoId || periodo || estado);

  return (
    <div className="space-y-4">
      <form
        method="get"
        action="/evaluacion/formatos"
        className="flex flex-wrap items-end gap-2 rounded-[20px] border bg-card p-3"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Cargo
          <select name="cargo" defaultValue={cargoId} className={SELECT}>
            <option value="">Todos</option>
            {(cargos ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Periodo
          <select name="periodo" defaultValue={periodo} className={SELECT}>
            <option value="">Todos</option>
            {periodos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Estado
          <select name="estado" defaultValue={estado} className={SELECT}>
            <option value="">Todos</option>
            {ESTADOS_EVALUACION.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_EVALUACION[e]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          <Filter /> Filtrar
        </Button>
        {hayFiltro && (
          <Button asChild variant="ghost">
            <Link href="/evaluacion/formatos">Limpiar</Link>
          </Button>
        )}
        {puedeEditar && (
          <Button asChild className="ml-auto">
            <Link href="/evaluacion/formatos/nueva">
              <ClipboardList /> Nueva evaluación
            </Link>
          </Button>
        )}
      </form>

      {error ? (
        <EstadoVacio titulo="No se pudieron cargar las evaluaciones" descripcion={error.message} />
      ) : !evaluaciones || evaluaciones.length === 0 ? (
        <EstadoVacio
          icono={<ClipboardList />}
          titulo={hayFiltro ? "Sin resultados" : "Todavía no hay evaluaciones"}
          descripcion={
            hayFiltro
              ? "Prueba con otros filtros."
              : puedeEditar
                ? "Crea la primera con el botón «Nueva evaluación»."
                : "Cuando se registren evaluaciones aparecerán aquí."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-[20px] border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evaluado</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Evaluador</TableHead>
                <TableHead className="text-right">Nota final</TableHead>
                <TableHead>Nivel</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {evaluaciones.map((e) => {
                const r = resultadoPorId.get(e.id);
                const nota = r && r.n_calificaciones > 0 ? r.nota_final : null;
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      <Link href={`/evaluacion/formatos/${e.id}`} className="hover:text-primary hover:underline">
                        {e.evaluado_nombre}
                      </Link>
                    </TableCell>
                    <TableCell>{nombreCargo.get(e.cargo_id) ?? "—"}</TableCell>
                    <TableCell>{e.periodo}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatearFecha(e.fecha_evaluacion)}</TableCell>
                    <TableCell>{e.evaluador_nombre}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatearNota(nota)}</TableCell>
                    <TableCell>
                      {nota !== null ? (
                        <Badge variant={varianteNota(nota)}>{nivelFormato(nota)}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin calificar</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.estado === "cerrada" ? "outline" : "secondary"}>
                        {ETIQUETA_ESTADO_EVALUACION[e.estado]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/evaluacion/formatos/${e.id}`}>Abrir</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
