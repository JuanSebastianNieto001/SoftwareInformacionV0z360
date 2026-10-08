/** La estructura operativa: quién es asesor, de qué team leader y con qué cuenta en la app. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Filter, Users } from "lucide-react";
import { BotonActivoAsesor } from "@/components/calidad/boton-activo-asesor";
import { FormularioAsesor } from "@/components/calidad/formulario-asesor";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { nombreComparable } from "@/lib/cumpleanos";
import { formatearFecha } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos-acceso";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Estructura operativa" };

const SELECT =
  "h-[40px] rounded-lg border-[1.5px] border-input bg-campo px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-ring/20";

export default async function PaginaAsesores({ searchParams }: PageProps<"/calidad/asesores">) {
  const sp = await searchParams;
  const { supabase, puedeEditar } = await exigirModulo("calidad");
  if (!puedeEditar) notFound();
  const tl = typeof sp.tl === "string" ? sp.tl : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const verInactivos = sp.inactivos === "1";

  const [{ data: asesores }, { data: perfiles }] = await Promise.all([
    supabase.from("calidad_asesores").select("*").order("team_leader").order("nombre"),
    supabase.from("perfiles").select("id, nombre").eq("activo", true).order("nombre"),
  ]);
  const todos = asesores ?? [];
  const teamLeaders = [...new Set(todos.map((a) => a.team_leader).filter((t): t is string => !!t))].sort();
  const nombrePerfil = new Map((perfiles ?? []).map((p) => [p.id, p.nombre]));
  const visibles = todos.filter((a) => (verInactivos || a.activo) && (!tl || a.team_leader === tl) && (!q || nombreComparable(a.nombre).includes(nombreComparable(q))));

  return (
    <div className="space-y-4">
      <form method="get" action="/calidad/asesores" className="flex flex-wrap items-end gap-2 rounded-[20px] border bg-card p-3">
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
          Nombre
          <input name="q" defaultValue={q} placeholder="Buscar…" className={cn(SELECT, "w-48")} />
        </label>
        <label className="flex items-center gap-2 pb-2.5 text-xs font-medium text-muted-foreground">
          <input type="checkbox" name="inactivos" value="1" defaultChecked={verInactivos} /> Ver inactivos
        </label>
        <Button type="submit" variant="outline">
          <Filter /> Filtrar
        </Button>
        {(tl || q || verInactivos) && (
          <Button asChild variant="ghost">
            <Link href="/calidad/asesores">Limpiar</Link>
          </Button>
        )}
        <div className="ml-auto">
          <FormularioAsesor teamLeaders={teamLeaders} perfiles={perfiles ?? []} />
        </div>
      </form>

      {visibles.length === 0 ? (
        <EstadoVacio icono={<Users />} titulo="Sin personas" descripcion="Agrega la primera o ajusta los filtros." />
      ) : (
        <div className="overflow-x-auto rounded-[20px] border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Cédula</TableHead>
                <TableHead>Team leader</TableHead>
                <TableHead>Campaña</TableHead>
                <TableHead>Contratación</TableHead>
                <TableHead>Cuenta en la app</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((a) => (
                <TableRow key={a.id} className={cn(!a.activo && "text-muted-foreground line-through")}>
                  <TableCell className="font-medium">{a.nombre}</TableCell>
                  <TableCell className="font-mono text-xs">{a.cedula ?? "—"}</TableCell>
                  <TableCell>{a.team_leader ?? <span className="text-xs text-muted-foreground">Sin asignar</span>}</TableCell>
                  <TableCell className="text-xs">{a.campana ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{a.fecha_contratacion ? formatearFecha(a.fecha_contratacion) : "—"}</TableCell>
                  <TableCell>
                    {a.usuario_id ? (
                      <Badge variant="secondary">{nombrePerfil.get(a.usuario_id) ?? "Vinculada"}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin vincular · no puede firmar</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <BotonActivoAsesor id={a.id} nombre={a.nombre} activo={a.activo} />
                    <FormularioAsesor asesor={a} teamLeaders={teamLeaders} perfiles={perfiles ?? []} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {visibles.length} de {todos.length} personas · {todos.filter((a) => a.usuario_id).length} con cuenta vinculada.
      </p>
    </div>
  );
}
