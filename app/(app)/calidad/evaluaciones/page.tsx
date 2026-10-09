/** Listado de auditorías con filtros por asesor, team leader, estado y fechas, y exportación a CSV. */
import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Download, Filter } from "lucide-react";
import { FechaAuditoriaEditable } from "@/components/calidad/fecha-auditoria-editable";
import { BotonPublicarLote, BotonPublicarUna } from "@/components/calidad/publicar-auditorias";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ETIQUETA_ESTADO_EVALUACION_CALIDAD, ETIQUETA_ESTADO_RETRO, formatearPorcentaje, varianteNotaCalidad } from "@/lib/calidad";
import { contarMisBorradores, listarAuditorias, listarTeamLeadersCalidad } from "@/lib/calidad/datos";
import { formatearFecha } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos-acceso";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Auditorías de calidad" };

const SELECT =
  "h-[40px] rounded-lg border-[1.5px] border-input bg-campo px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-ring/20";

export default async function PaginaAuditorias({ searchParams }: PageProps<"/calidad/evaluaciones">) {
  const sp = await searchParams;
  const { supabase, user, perfil, puedeEditar } = await exigirModulo("calidad");
  const esAdmin = perfil.rol === "admin";
  const nueva = typeof sp.nueva === "string" ? sp.nueva : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const tl = typeof sp.tl === "string" ? sp.tl : "";
  const estado = sp.estado === "borrador" || sp.estado === "publicada" ? sp.estado : "";
  const desde = typeof sp.desde === "string" ? sp.desde : "";
  const hasta = typeof sp.hasta === "string" ? sp.hasta : "";

  const [{ data: filas, error }, teamLeaders, misBorradores] = await Promise.all([
    listarAuditorias(supabase, { q, tl, estado, desde, hasta }),
    listarTeamLeadersCalidad(supabase),
    contarMisBorradores(supabase, user.id),
  ]);
  const hayFiltro = !!(q || tl || estado || desde || hasta);
  const csv = `/api/calidad/csv?${new URLSearchParams({ q, tl, estado, desde, hasta }).toString()}`;

  return (
    <div className="space-y-4">
      <form method="get" action="/calidad/evaluaciones" className="flex flex-wrap items-end gap-2 rounded-[20px] border bg-card p-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Asesor
          <input name="q" defaultValue={q} placeholder="Nombre…" className={cn(SELECT, "w-44")} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Team leader
          <select name="tl" defaultValue={tl} className={SELECT}>
            <option value="">Todos</option>
            {teamLeaders.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Estado
          <select name="estado" defaultValue={estado} className={SELECT}>
            <option value="">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="publicada">Publicada</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Desde
          <input type="date" name="desde" defaultValue={desde} className={SELECT} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Hasta
          <input type="date" name="hasta" defaultValue={hasta} className={SELECT} />
        </label>
        <Button type="submit" variant="outline">
          <Filter /> Filtrar
        </Button>
        {hayFiltro && (
          <Button asChild variant="ghost">
            <Link href="/calidad/evaluaciones">Limpiar</Link>
          </Button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {puedeEditar && <BotonPublicarLote cantidad={misBorradores ?? 0} />}
          <Button asChild variant="outline">
            <a href={csv}>
              <Download /> CSV
            </a>
          </Button>
          {puedeEditar && (
            <Button asChild>
              <Link href="/calidad/evaluaciones/nueva">
                <ClipboardList /> Nueva auditoría
              </Link>
            </Button>
          )}
        </div>
      </form>

      {error ? (
        <EstadoVacio titulo="No se pudieron cargar las auditorías" descripcion={error.message} />
      ) : !filas || filas.length === 0 ? (
        <EstadoVacio icono={<ClipboardList />} titulo={hayFiltro ? "Sin resultados" : "Todavía no hay auditorías"} descripcion={hayFiltro ? "Prueba con otros filtros." : puedeEditar ? "Crea la primera con «Nueva auditoría»." : "Cuando se registren aparecerán aquí."} />
      ) : (
        <div className="overflow-x-auto rounded-[20px] border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asesor</TableHead>
                <TableHead>Team leader</TableHead>
                <TableHead>Interacción</TableHead>
                <TableHead>Auditoría</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Analista</TableHead>
                <TableHead className="text-right">Nota</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Feedback</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((e) => {
                const nota = e.nota_final === null ? null : Number(e.nota_final);
                return (
                  <TableRow key={e.id} className={cn(e.id === nueva && "bg-tinte ring-2 ring-primary/40 ring-inset")}>
                    <TableCell className="font-medium">
                      <Link href={`/calidad/evaluaciones/${e.id}`} className="hover:text-primary hover:underline">
                        {e.asesor_nombre}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">{e.team_leader ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatearFecha(e.fecha_interaccion)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {puedeEditar && (e.analista_id === user.id || esAdmin) ? (
                        <FechaAuditoriaEditable id={e.id} fecha={e.fecha_auditoria} />
                      ) : (
                        formatearFecha(e.fecha_auditoria)
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {e.tipo}
                      {e.etapa ? ` · ${e.etapa}` : ""}
                    </TableCell>
                    <TableCell className="text-xs">{e.analista_nombre}</TableCell>
                    <TableCell className="text-right">
                      {e.estado === "publicada" && nota !== null ? (
                        <Badge variant={varianteNotaCalidad(nota, Number(e.nota_minima))}>
                          {formatearPorcentaje(nota)}
                          {Number(e.n_fatales_fallados) > 0 ? " · crítico" : ""}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{formatearPorcentaje(nota)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.estado === "publicada" ? "outline" : "secondary"}>{ETIQUETA_ESTADO_EVALUACION_CALIDAD[e.estado]}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{e.retro_estado ? ETIQUETA_ESTADO_RETRO[e.retro_estado] : "—"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {puedeEditar && e.estado === "borrador" && <BotonPublicarUna id={e.id} />}
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/calidad/evaluaciones/${e.id}`}>Abrir</Link>
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
