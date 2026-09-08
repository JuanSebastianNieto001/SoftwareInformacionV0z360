import Link from "next/link";
import { FileText } from "lucide-react";
import { AvisoVencePronto, EstadoBadge, vencePronto } from "@/components/estado-badge";
import { EstadoVacio } from "@/components/encabezado-pagina";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { extensionVisible } from "@/lib/archivos";
import { describirVencimiento, formatearBytes, formatearFecha } from "@/lib/formato";
import type { DocumentoConEstado } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

export type DocumentoLista = Pick<
  DocumentoConEstado,
  | "id"
  | "titulo"
  | "nombre_archivo"
  | "tamano_bytes"
  | "vigente_desde"
  | "vigente_hasta"
  | "estado"
  | "area_nombre"
  | "version"
  | "veces_consultado"
  | "usuarios_distintos"
  | "actualizado_en"
>;

export function ListaDocumentos({
  documentos,
  mostrarArea = false,
  resaltarVencimiento = false,
  mostrarConsultas = false,
  vacio,
}: {
  documentos: DocumentoLista[];
  mostrarArea?: boolean;
  /** Editores: marca visible cuando faltan menos de 7 días. */
  resaltarVencimiento?: boolean;
  /** Admin: columnas de veces consultado / usuarios distintos. */
  mostrarConsultas?: boolean;
  vacio?: React.ReactNode;
}) {
  if (documentos.length === 0) {
    return (
      vacio ?? (
        <EstadoVacio
          icono={<FileText />}
          titulo="No hay documentos"
          descripcion="Cuando se suban documentos a esta área aparecerán aquí."
        />
      )
    );
  }

  return (
    <>
      {/* Móvil: tarjetas */}
      <ul className="flex flex-col gap-2 md:hidden">
        {documentos.map((d) => {
          const pronto = resaltarVencimiento && vencePronto(d.vigente_hasta, d.estado);
          return (
            <li key={d.id}>
              <Link
                href={`/documentos/${d.id}`}
                className={cn(
                  "block rounded-lg border bg-card p-3 active:bg-muted",
                  pronto && "border-amber-300 dark:border-amber-800",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{d.titulo}</p>
                  <EstadoBadge estado={d.estado} className="shrink-0" />
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {mostrarArea && <>{d.area_nombre} · </>}
                  {extensionVisible(d.nombre_archivo)} · {formatearBytes(d.tamano_bytes)}
                  {d.version > 1 && <> · v{d.version}</>}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{describirVencimiento(d.vigente_hasta)}</span>
                  {pronto && <AvisoVencePronto vigenteHasta={d.vigente_hasta} estado={d.estado} />}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Escritorio: tabla densa */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Documento</TableHead>
              {mostrarArea && <TableHead>Área</TableHead>}
              <TableHead>Archivo</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead>Estado</TableHead>
              {mostrarConsultas && <TableHead className="text-right">Consultas</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {documentos.map((d) => {
              const pronto = resaltarVencimiento && vencePronto(d.vigente_hasta, d.estado);
              return (
                <TableRow key={d.id} className={cn(pronto && "bg-amber-50/60 dark:bg-amber-950/20")}>
                  <TableCell className="max-w-md">
                    <Link href={`/documentos/${d.id}`} className="font-medium hover:underline">
                      {d.titulo}
                    </Link>
                    {d.version > 1 && (
                      <span className="ml-2 text-xs text-muted-foreground">v{d.version}</span>
                    )}
                  </TableCell>
                  {mostrarArea && (
                    <TableCell className="text-muted-foreground">{d.area_nombre}</TableCell>
                  )}
                  <TableCell className="text-muted-foreground">
                    {extensionVisible(d.nombre_archivo)} · {formatearBytes(d.tamano_bytes)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">
                        {formatearFecha(d.vigente_desde)}
                        {" → "}
                        {d.vigente_hasta ? formatearFecha(d.vigente_hasta) : "sin vencimiento"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {describirVencimiento(d.vigente_hasta)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <EstadoBadge estado={d.estado} />
                      {pronto && <AvisoVencePronto vigenteHasta={d.vigente_hasta} estado={d.estado} />}
                    </div>
                  </TableCell>
                  {mostrarConsultas && (
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {d.veces_consultado}
                      <span className="text-xs"> / {d.usuarios_distintos} pers.</span>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
