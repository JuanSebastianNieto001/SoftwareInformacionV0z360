import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Download } from "lucide-react";
import { EncabezadoPagina, EstadoVacio } from "@/components/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  consultaAuditoria,
  ETIQUETA_ACCION,
  filtrosAQuery,
  filtrosDesdeParams,
} from "@/lib/auditoria-consulta";
import { formatearFechaHora } from "@/lib/formato";
import { exigirAdmin } from "@/lib/sesion";
import { ACCIONES } from "@/lib/validaciones";

export const metadata: Metadata = { title: "Auditoría" };

const LIMITE = 200;

const CLASE_SELECT =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function PaginaAuditoria({ searchParams }: PageProps<"/admin/auditoria">) {
  const sp = await searchParams;
  const { supabase } = await exigirAdmin();
  const filtros = filtrosDesdeParams(sp);

  const [{ data: filas, count, error }, { data: perfiles }] = await Promise.all([
    consultaAuditoria(supabase, filtros, { limite: LIMITE, conteo: true }),
    supabase.from("perfiles").select("id, nombre").order("nombre"),
  ]);

  const hayFiltros = Object.values(filtros).some(Boolean);
  const query = filtrosAQuery(filtros);

  return (
    <>
      <EncabezadoPagina
        kicker="Administración"
        titulo="Auditoría"
        descripcion="Quién abrió, descargó, subió o editó cada documento. El registro es inmutable: nadie puede modificarlo ni borrarlo, ni siquiera el administrador."
        acciones={
          <Button variant="outline" asChild>
            <a href={`/api/admin/auditoria/csv${query}`}>
              <Download /> Exportar CSV
            </a>
          </Button>
        }
      />

      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <Input
          type="search"
          name="q"
          defaultValue={filtros.q ?? ""}
          placeholder="Documento, persona, correo o área"
          aria-label="Buscar"
          className="lg:col-span-2"
        />
        <select name="usuario" defaultValue={filtros.usuario ?? ""} aria-label="Persona" className={CLASE_SELECT}>
          <option value="">Todas las personas</option>
          {(perfiles ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre || p.id.slice(0, 8)}
            </option>
          ))}
        </select>
        <select name="accion" defaultValue={filtros.accion ?? ""} aria-label="Acción" className={CLASE_SELECT}>
          <option value="">Todas las acciones</option>
          {ACCIONES.map((a) => (
            <option key={a} value={a}>
              {ETIQUETA_ACCION[a]}
            </option>
          ))}
        </select>
        <Input type="date" name="desde" defaultValue={filtros.desde ?? ""} aria-label="Desde" />
        <Input type="date" name="hasta" defaultValue={filtros.hasta ?? ""} aria-label="Hasta" />
        {filtros.documento && <input type="hidden" name="documento" value={filtros.documento} />}
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
          {hayFiltros && (
            <Button type="button" variant="ghost" asChild>
              <Link href="/admin/auditoria">Limpiar</Link>
            </Button>
          )}
          <p className="ml-auto self-center text-sm text-muted-foreground">
            {count !== null && count !== undefined
              ? `${count.toLocaleString("es-CO")} ${count === 1 ? "registro" : "registros"}${count > LIMITE ? ` · mostrando ${LIMITE}` : ""}`
              : ""}
          </p>
        </div>
      </form>

      {error ? (
        <EstadoVacio titulo="No se pudo cargar la auditoría" descripcion={error.message} />
      ) : !filas || filas.length === 0 ? (
        <EstadoVacio
          icono={<ClipboardList />}
          titulo={hayFiltros ? "Sin registros con esos filtros" : "Todavía no hay actividad registrada"}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead className="hidden md:table-cell">Área</TableHead>
                <TableHead className="hidden lg:table-cell">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatearFechaHora(f.ocurrio_en)}</TableCell>
                  <TableCell>
                    <span className="block">{f.usuario_nombre || "—"}</span>
                    <span className="block text-xs text-muted-foreground">{f.usuario_email}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={f.accion === "eliminar" ? "destructive" : "secondary"}>
                      {ETIQUETA_ACCION[f.accion] ?? f.accion}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {f.documento_id ? (
                      <Link href={`/documentos/${f.documento_id}`} className="hover:underline">
                        {f.doc_titulo}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{f.doc_titulo || "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{f.area_nombre || "—"}</TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">{f.ip ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
