import type { Metadata } from "next";
import { Layers } from "lucide-react";
import { FormularioArea, InterruptorArea } from "@/components/admin/gestion-areas";
import { EncabezadoPagina, EstadoVacio } from "@/components/encabezado-pagina";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatearFecha } from "@/lib/formato";
import { exigirAdmin } from "@/lib/sesion";

export const metadata: Metadata = { title: "Áreas" };

export default async function PaginaAreasAdmin() {
  const { supabase } = await exigirAdmin();

  const { data: areas } = await supabase
    .from("areas")
    .select("id, nombre, slug, descripcion, activa, creado_en, documentos(count), permisos_area(count)")
    .order("nombre");

  return (
    <>
      <EncabezadoPagina
        kicker="Administración"
        titulo="Áreas"
        descripcion="Cada área agrupa documentos y permisos. Desactivar un área la oculta para todos sin borrar nada."
        acciones={<FormularioArea />}
      />

      {!areas || areas.length === 0 ? (
        <EstadoVacio
          icono={<Layers />}
          titulo="Todavía no hay áreas"
          descripcion="Crea la primera (por ejemplo: Comercial, Talento humano, Operaciones)."
          accion={<FormularioArea />}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Área</TableHead>
                <TableHead className="hidden md:table-cell">Descripción</TableHead>
                <TableHead className="text-right">Docs</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Personas</TableHead>
                <TableHead className="hidden sm:table-cell">Creada</TableHead>
                <TableHead>Activa</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {areas.map((a) => (
                <TableRow key={a.id} className={a.activa ? undefined : "text-muted-foreground"}>
                  <TableCell>
                    <span className="block font-medium">{a.nombre}</span>
                    <span className="block font-mono text-xs text-muted-foreground">/{a.slug}</span>
                  </TableCell>
                  <TableCell className="hidden max-w-sm truncate md:table-cell">{a.descripcion ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.documentos?.[0]?.count ?? 0}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {a.permisos_area?.[0]?.count ?? 0}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap sm:table-cell">{formatearFecha(a.creado_en)}</TableCell>
                  <TableCell>
                    <InterruptorArea id={a.id} activa={a.activa} nombre={a.nombre} />
                  </TableCell>
                  <TableCell>
                    <FormularioArea area={{ id: a.id, nombre: a.nombre, descripcion: a.descripcion ?? "" }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
