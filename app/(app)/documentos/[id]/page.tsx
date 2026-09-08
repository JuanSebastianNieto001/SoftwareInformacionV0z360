import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
} from "lucide-react";
import { AccionesDocumento } from "@/components/acciones-documento";
import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { AvisoVencePronto, EstadoBadge } from "@/components/estado-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { extensionVisible } from "@/lib/archivos";
import { describirVencimiento, formatearBytes, formatearFecha, formatearFechaHora } from "@/lib/formato";
import { exigirSesion } from "@/lib/sesion";
import { ETIQUETA_MIME, type MimePermitido } from "@/lib/validaciones";

export const metadata: Metadata = { title: "Documento" };

const ETIQUETA_ACCION: Record<string, string> = {
  abrir: "Abrió",
  descargar: "Descargó",
};

export default async function PaginaDocumento({ params }: PageProps<"/documentos/[id]">) {
  const { id } = await params;
  const { supabase, perfil } = await exigirSesion();

  // RLS: si no tiene permiso (o está vencido y es lector), no existe.
  const { data: doc } = await supabase
    .from("v_documentos_estado")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!doc) notFound();

  const esAdmin = perfil.rol === "admin";

  const [{ data: nivel }, { data: area }, accesos, pendientes] = await Promise.all([
    supabase.rpc("nivel_en_area", { a: doc.area_id }),
    supabase.from("areas").select("slug").eq("id", doc.area_id).maybeSingle(),
    esAdmin
      ? supabase
          .from("accesos")
          .select("id, usuario_nombre, usuario_email, accion, ocurrio_en, ip")
          .eq("documento_id", doc.id)
          .in("accion", ["abrir", "descargar"])
          .order("ocurrio_en", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: null }),
    esAdmin ? supabase.rpc("pendientes_de_leer", { doc: doc.id }) : Promise.resolve({ data: null }),
  ]);

  const puedeEditar = nivel === "edicion";
  const purgado = doc.estado === "purgado";
  const mimeEtiqueta = doc.mime ? ETIQUETA_MIME[doc.mime as MimePermitido] ?? doc.mime : "—";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-3">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link href={area ? `/areas/${area.slug}` : "/"}>
            <ArrowLeft /> {doc.area_nombre}
          </Link>
        </Button>
      </div>

      <EncabezadoPagina
        titulo={doc.titulo}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <EstadoBadge estado={doc.estado} />
            <AvisoVencePronto vigenteHasta={doc.vigente_hasta} estado={doc.estado} />
            <span>
              {doc.area_nombre} · v{doc.version}
            </span>
          </span>
        }
      />

      {purgado && (
        <Alert className="mb-4">
          <EyeOff className="size-4" />
          <AlertTitle>Archivo purgado</AlertTitle>
          <AlertDescription>
            El archivo se borró del almacenamiento el {formatearFecha(doc.purgado_en)} por vencimiento.
            Los metadatos se conservan para la trazabilidad.
          </AlertDescription>
        </Alert>
      )}
      {doc.estado === "vencido" && (
        <Alert className="mb-4 border-amber-300 text-amber-900 dark:border-amber-800 dark:text-amber-200">
          <AlertTriangle className="size-4" />
          <AlertTitle>Vencido</AlertTitle>
          <AlertDescription>
            Los lectores ya no lo ven. El archivo se borrará 7 días después del vencimiento
            {puedeEditar && " salvo que edites la vigencia para renovarlo"}.
          </AlertDescription>
        </Alert>
      )}
      {doc.estado === "programado" && (
        <Alert className="mb-4">
          <CalendarClock className="size-4" />
          <AlertTitle>Programado</AlertTitle>
          <AlertDescription>
            Será visible para los lectores a partir del {formatearFechaHora(doc.vigente_desde)}.
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button asChild size="lg" disabled={purgado}>
          <a
            href={purgado ? undefined : `/api/documentos/${doc.id}/abrir`}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={purgado || undefined}
          >
            <ExternalLink /> Abrir
          </a>
        </Button>
        {!purgado && (
          <Button asChild size="lg" variant="outline">
            <a href={`/api/documentos/${doc.id}/abrir?descargar=1`}>
              <Download /> Descargar
            </a>
          </Button>
        )}
        {puedeEditar && (
          <Button asChild size="lg" variant="outline">
            <Link href={`/documentos/${doc.id}/editar`}>
              <Pencil /> Editar
            </Link>
          </Button>
        )}
        {esAdmin && (
          <AccionesDocumento id={doc.id} titulo={doc.titulo} areaSlug={area?.slug ?? null}>
            <Trash2 /> Eliminar
          </AccionesDocumento>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Detalles</CardTitle>
          </CardHeader>
          <CardContent>
            {doc.descripcion && <p className="mb-4 whitespace-pre-line text-sm">{doc.descripcion}</p>}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Dato etiqueta="Archivo">
                {doc.nombre_archivo}
                <span className="text-muted-foreground">
                  {" "}
                  · {extensionVisible(doc.nombre_archivo)} · {formatearBytes(doc.tamano_bytes)}
                </span>
              </Dato>
              <Dato etiqueta="Tipo">{mimeEtiqueta}</Dato>
              <Dato etiqueta="Vigente desde">{formatearFechaHora(doc.vigente_desde)}</Dato>
              <Dato etiqueta="Vigente hasta">
                {doc.vigente_hasta ? formatearFechaHora(doc.vigente_hasta) : "Sin vencimiento"}
                <span className="block text-xs text-muted-foreground">{describirVencimiento(doc.vigente_hasta)}</span>
              </Dato>
              <Dato etiqueta="Subido por">{doc.subido_por_nombre ?? "—"}</Dato>
              <Dato etiqueta="Versión">v{doc.version}</Dato>
              <Dato etiqueta="Creado">{formatearFechaHora(doc.creado_en)}</Dato>
              <Dato etiqueta="Última actualización">{formatearFechaHora(doc.actualizado_en)}</Dato>
              {doc.etiquetas.length > 0 && (
                <Dato etiqueta="Etiquetas" className="sm:col-span-2">
                  <span className="flex flex-wrap gap-1">
                    {doc.etiquetas.map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                  </span>
                </Dato>
              )}
            </dl>
          </CardContent>
        </Card>

        {esAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Consultas</CardTitle>
              <CardDescription>
                {doc.veces_consultado} {doc.veces_consultado === 1 ? "apertura" : "aperturas"} ·{" "}
                {doc.usuarios_distintos} {doc.usuarios_distintos === 1 ? "persona" : "personas"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <EyeOff className="size-4 text-muted-foreground" /> Pendientes de leer
                <span className="text-muted-foreground">({pendientes.data?.length ?? 0})</span>
              </h3>
              {pendientes.data && pendientes.data.length > 0 ? (
                <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                  {pendientes.data.map((p) => (
                    <li key={p.usuario_id} className="flex flex-col">
                      <span>{p.nombre || p.email}</span>
                      <span className="text-xs text-muted-foreground">{p.email}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Todas las personas con acceso al área ya lo consultaron.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {esAdmin && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Eye className="size-4 text-muted-foreground" /> Quién lo consultó
            </CardTitle>
            <CardDescription>Últimas 100 aperturas y descargas registradas.</CardDescription>
          </CardHeader>
          <CardContent>
            {accesos.data && accesos.data.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Persona</TableHead>
                      <TableHead>Acción</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="hidden sm:table-cell">IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accesos.data.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <span className="block">{a.usuario_nombre || a.usuario_email}</span>
                          <span className="block text-xs text-muted-foreground">{a.usuario_email}</span>
                        </TableCell>
                        <TableCell>{ETIQUETA_ACCION[a.accion] ?? a.accion}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatearFechaHora(a.ocurrio_en)}</TableCell>
                        <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                          {a.ip ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nadie lo ha abierto todavía.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Dato({
  etiqueta,
  children,
  className,
}: {
  etiqueta: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}
