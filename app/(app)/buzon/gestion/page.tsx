import type { Metadata } from "next";
import Link from "next/link";
import { Download, Inbox } from "lucide-react";
import { DialogoTratamiento } from "@/components/admin/gestion-sugerencias";
import { EncabezadoPagina, EstadoVacio } from "@/components/encabezado-pagina";
import { TableroBuzon } from "@/components/tablero-buzon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ETIQUETA_ESTADO,
  ETIQUETA_TIPO,
  VARIANTE_ESTADO,
  etiquetaArea,
  radicado,
} from "@/lib/buzon";
import { formatearFecha } from "@/lib/formato";
import { exigirGestorBuzon } from "@/lib/sesion";

export const metadata: Metadata = { title: "Buzón" };

export default async function PaginaBuzonAdmin() {
  const { supabase } = await exigirGestorBuzon();

  // Las dos consultas son independientes: van en paralelo.
  const [{ data: casos }, { data: personas }] = await Promise.all([
    supabase.from("sugerencias").select("*").order("creado_en", { ascending: false }).limit(500),
    supabase.from("perfiles").select("id, nombre").eq("activo", true).order("nombre"),
  ]);

  return (
    <>
      <EncabezadoPagina
        titulo="Buzón"
        descripcion="Responde cada caso por correo y adjunta aquí el pantallazo: sin esa prueba el caso no se puede cerrar."
        acciones={
          <Button variant="outline" asChild>
            <Link href="/api/buzon/csv" prefetch={false}>
              <Download /> Exportar CSV
            </Link>
          </Button>
        }
      />

      <TableroBuzon casos={casos ?? []} />

      {!casos || casos.length === 0 ? (
        <EstadoVacio
          icono={<Inbox />}
          titulo="El buzón está vacío"
          descripcion="Cuando alguien envíe una sugerencia o una queja, aparecerá aquí con su número de radicado."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Radicado</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden md:table-cell">Área</TableHead>
                <TableHead className="hidden sm:table-cell">Quién</TableHead>
                <TableHead className="hidden lg:table-cell">Recibido</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {casos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {radicado(c.consecutivo)}
                  </TableCell>
                  <TableCell>{ETIQUETA_TIPO[c.tipo]}</TableCell>
                  <TableCell className="hidden max-w-40 truncate md:table-cell">
                    {etiquetaArea(c.proceso)}
                  </TableCell>
                  <TableCell className="hidden max-w-40 truncate sm:table-cell">
                    {c.emisor_nombre || c.emisor_email}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap lg:table-cell">
                    {formatearFecha(c.creado_en)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={VARIANTE_ESTADO[c.estado]}>{ETIQUETA_ESTADO[c.estado]}</Badge>
                  </TableCell>
                  <TableCell>
                    <DialogoTratamiento sugerencia={c} personas={personas ?? []} />
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
