import type { Metadata } from "next";
import Link from "next/link";
import { Cake, Filter } from "lucide-react";
import { eliminarCumple } from "@/app/acciones/cumpleanos";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { FormularioCumple } from "@/components/cumpleanos/formulario-cumple";
import { BotonEliminar } from "@/components/evaluacion/boton-eliminar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GRUPO_ESTRUCTURA, diaMes, enCuanto, nombreComparable } from "@/lib/cumpleanos";
import { exigirModulo } from "@/lib/modulos-acceso";
import type { CumpleProximo } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Cumpleaños" };

const SELECT =
  "h-[40px] rounded-lg border-[1.5px] border-input bg-campo px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-ring/20";

/**
 * Lo primero que se ve es lo urgente: hoy, mañana y los próximos 30 días.
 * Debajo, la lista completa por team leader, que es como está el libro.
 */
export default async function PaginaCumpleanos({ searchParams }: PageProps<"/cumpleanos">) {
  const sp = await searchParams;
  const { supabase, puedeEditar, puedeEliminar } = await exigirModulo("cumpleanos");

  const tl = typeof sp.tl === "string" ? sp.tl : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const verInactivos = sp.inactivos === "1";

  const [{ data: filas, error }, { data: perfiles }] = await Promise.all([
    supabase.from("v_cumpleanos").select("*").order("dias_faltan").limit(1000),
    puedeEditar
      ? supabase.from("perfiles").select("id, nombre").eq("activo", true).order("nombre")
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ]);

  const todas = filas ?? [];
  const teamLeaders = [...new Set(todas.map((c) => c.team_leader).filter((t): t is string => !!t))].sort();

  const visibles = todas.filter((c) => {
    if (!verInactivos && !c.activo) return false;
    if (tl === "estructura" && c.team_leader) return false;
    if (tl && tl !== "estructura" && c.team_leader !== tl) return false;
    if (q && !nombreComparable(c.nombre).includes(nombreComparable(q))) return false;
    return true;
  });

  const hoy = visibles.filter((c) => c.activo && c.dias_faltan === 0);
  const manana = visibles.filter((c) => c.activo && c.dias_faltan === 1);
  const proximos = visibles.filter((c) => c.activo && c.dias_faltan > 1 && c.dias_faltan <= 30);

  // Lista completa agrupada como el libro: Estructura primero, luego cada equipo.
  const grupos = new Map<string, CumpleProximo[]>();
  for (const c of visibles) {
    const g = c.team_leader ?? GRUPO_ESTRUCTURA;
    grupos.set(g, [...(grupos.get(g) ?? []), c]);
  }
  const ordenGrupos = [GRUPO_ESTRUCTURA, ...teamLeaders].filter((g) => grupos.has(g));
  for (const g of ordenGrupos) {
    grupos.get(g)!.sort((a, b) => a.cumple_mes - b.cumple_mes || a.cumple_dia - b.cumple_dia);
  }

  const hayFiltro = !!(tl || q || verInactivos);

  return (
    <div className="space-y-8">
      <form method="get" action="/cumpleanos" className="flex flex-wrap items-end gap-2 rounded-[20px] border bg-card p-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Team leader
          <select name="tl" defaultValue={tl} className={SELECT}>
            <option value="">Todos</option>
            <option value="estructura">Estructura (sin team leader)</option>
            {teamLeaders.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Nombre
          <input name="q" defaultValue={q} placeholder="Buscar…" className={cn(SELECT, "w-48")} />
        </label>
        <label className="flex items-center gap-2 pb-2.5 text-xs font-medium text-muted-foreground">
          <input type="checkbox" name="inactivos" value="1" defaultChecked={verInactivos} /> Ver inactivos
        </label>
        <Button type="submit" variant="outline">
          <Filter /> Filtrar
        </Button>
        {hayFiltro && (
          <Button asChild variant="ghost">
            <Link href="/cumpleanos">Limpiar</Link>
          </Button>
        )}
        {puedeEditar && (
          <div className="ml-auto">
            <FormularioCumple teamLeaders={teamLeaders} perfiles={perfiles ?? []} />
          </div>
        )}
      </form>

      {error && <EstadoVacio titulo="No se pudieron cargar los cumpleaños" descripcion={error.message} />}

      {!error && todas.length === 0 && (
        <EstadoVacio
          icono={<Cake />}
          titulo="Todavía no hay cumpleaños registrados"
          descripcion={puedeEditar ? "Agrega el primero con el botón de arriba." : "Cuando se registren aparecerán aquí."}
        />
      )}

      {/* Lo urgente */}
      {(hoy.length > 0 || manana.length > 0 || proximos.length > 0) && (
        <section className="grid gap-4 lg:grid-cols-3">
          <Bloque titulo="Hoy" tono="hoy" filas={hoy} vacio="Nadie cumple hoy." />
          <Bloque titulo="Mañana" tono="manana" filas={manana} vacio="Nadie cumple mañana." />
          <Bloque titulo="Próximos 30 días" tono="pronto" filas={proximos} vacio="Sin cumpleaños en el mes." />
        </section>
      )}

      {/* Lista completa, como el libro */}
      {ordenGrupos.map((g) => {
        const lista = grupos.get(g)!;
        return (
          <section key={g} className="space-y-3">
            <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">
              {g === GRUPO_ESTRUCTURA ? "Estructura" : `Team leader · ${g}`}
              <Badge variant="outline">{lista.length}</Badge>
            </h2>
            <div className="overflow-x-auto rounded-[20px] border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Cumpleaños</TableHead>
                    <TableHead>Próximo</TableHead>
                    <TableHead className="text-right">Cumple</TableHead>
                    <TableHead>Cuenta en la app</TableHead>
                    {(puedeEditar || puedeEliminar) && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((c) => (
                    <TableRow key={c.id} className={cn(!c.activo && "text-muted-foreground line-through")}>
                      <TableCell className="font-medium">{c.nombre}</TableCell>
                      <TableCell className="whitespace-nowrap">{diaMes(c.cumple_dia, c.cumple_mes)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={c.dias_faltan === 0 ? "default" : c.dias_faltan === 1 ? "destructive" : "secondary"}
                        >
                          {enCuanto(c.dias_faltan)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.edad_que_cumple !== null ? `${c.edad_que_cumple} años` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.usuario_nombre ?? "Sin vincular"}
                      </TableCell>
                      {(puedeEditar || puedeEliminar) && (
                        <TableCell className="text-right whitespace-nowrap">
                          {puedeEditar && (
                            <FormularioCumple cumple={c} teamLeaders={teamLeaders} perfiles={perfiles ?? []} />
                          )}
                          {puedeEliminar && (
                            <BotonEliminar
                              compacto
                              accion={eliminarCumple.bind(null, c.id)}
                              titulo={`Eliminar a ${c.nombre}`}
                              descripcion="Se borra el registro. Si la persona solo dejó la empresa, es mejor marcarla como inactiva."
                            />
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Bloque({
  titulo,
  tono,
  filas,
  vacio,
}: {
  titulo: string;
  tono: "hoy" | "manana" | "pronto";
  filas: CumpleProximo[];
  vacio: string;
}) {
  return (
    <Card
      className={cn(
        "rounded-[20px]",
        tono === "hoy" && filas.length > 0 && "border-primary bg-tinte",
        tono === "manana" && filas.length > 0 && "border-amber-300 bg-amber-50",
      )}
    >
      <CardContent className="px-[18px] py-4">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          <Cake className="size-3.5" /> {titulo}
          {filas.length > 0 && <Badge variant="outline">{filas.length}</Badge>}
        </p>
        {filas.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{vacio}</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {filas.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium">{c.nombre}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.team_leader ? `Equipo de ${c.team_leader}` : "Estructura"}
                    {c.edad_que_cumple !== null ? ` · cumple ${c.edad_que_cumple}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                  {tono === "pronto" ? diaMes(c.cumple_dia, c.cumple_mes) : enCuanto(c.dias_faltan)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
