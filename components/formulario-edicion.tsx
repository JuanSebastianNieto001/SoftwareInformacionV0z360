"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertCircle, Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { BarraProgreso, SelectorArchivo } from "@/components/selector-archivo";
import { SelectorVigencia, type Vigencia } from "@/components/selector-vigencia";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { construirRutaStorage, sanitizarNombreArchivo } from "@/lib/archivos";
import { finDeDiaIso, formatearBytes, inicioDeDiaIso } from "@/lib/formato";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { llamarApi, normalizarArchivo, subirArchivoConProgreso } from "@/lib/subida-cliente";
import { esquemaEdicionDocumento, primerError } from "@/lib/validaciones";

export type DocumentoEditable = {
  id: string;
  area_id: string;
  titulo: string;
  descripcion: string;
  etiquetas: string;
  nombre_archivo: string;
  tamano_bytes: number | null;
  version: number;
  desde: string;
  hasta: string;
  purgado: boolean;
};

export function FormularioEdicion({ documento }: { documento: DocumentoEditable }) {
  const router = useRouter();
  const supabase = useMemo(() => crearClienteNavegador(), []);

  // --- Metadatos ---
  const [titulo, setTitulo] = useState(documento.titulo);
  const [descripcion, setDescripcion] = useState(documento.descripcion);
  const [etiquetas, setEtiquetas] = useState(documento.etiquetas);
  const [vigencia, setVigencia] = useState<Vigencia>({ desde: documento.desde, hasta: documento.hasta });
  const [guardando, setGuardando] = useState(false);
  const [errorMeta, setErrorMeta] = useState<string | null>(null);

  async function guardarMetadatos(e: React.FormEvent) {
    e.preventDefault();
    setErrorMeta(null);
    const datos = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || undefined,
      etiquetas: etiquetas.split(",").map((t) => t.trim()).filter(Boolean),
      vigente_desde: inicioDeDiaIso(vigencia.desde),
      vigente_hasta: vigencia.hasta ? finDeDiaIso(vigencia.hasta) : null,
    };
    const parsed = esquemaEdicionDocumento.safeParse(datos);
    if (!parsed.success) return setErrorMeta(primerError(parsed.error));

    setGuardando(true);
    try {
      await llamarApi(`/api/documentos/${documento.id}`, {
        method: "PATCH",
        body: JSON.stringify(parsed.data),
      });
      toast.success("Cambios guardados");
      router.push(`/documentos/${documento.id}`);
      router.refresh();
    } catch (err) {
      setErrorMeta(err instanceof Error ? err.message : "No se pudieron guardar los cambios.");
      setGuardando(false);
    }
  }

  // --- Reemplazo de archivo ---
  const [archivo, setArchivo] = useState<File | null>(null);
  const [faseArchivo, setFaseArchivo] = useState<"editando" | "subiendo" | "registrando">("editando");
  const [progreso, setProgreso] = useState(0);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const ocupadoArchivo = faseArchivo !== "editando";

  async function reemplazar(e: React.FormEvent) {
    e.preventDefault();
    setErrorArchivo(null);
    if (!archivo) return setErrorArchivo("Elige el archivo nuevo.");
    const normalizado = normalizarArchivo(archivo);
    if ("error" in normalizado) return setErrorArchivo(normalizado.error);

    const nombre = sanitizarNombreArchivo(normalizado.archivo.name);
    const ruta = construirRutaStorage(documento.area_id, documento.id, nombre);
    const mismoNombre = nombre === documento.nombre_archivo;

    try {
      setFaseArchivo("subiendo");
      setProgreso(0);
      await subirArchivoConProgreso(supabase, ruta, normalizado.archivo, {
        upsert: mismoNombre,
        onProgreso: setProgreso,
      });
      setFaseArchivo("registrando");
      const r = await llamarApi<{ version: number }>(`/api/documentos/${documento.id}/reemplazar`, {
        method: "POST",
        body: JSON.stringify({
          nombre_archivo: nombre,
          mime: normalizado.mime,
          tamano_bytes: normalizado.archivo.size,
        }),
      });
      toast.success(`Archivo reemplazado · ahora es la versión ${r.version}`);
      router.push(`/documentos/${documento.id}`);
      router.refresh();
    } catch (err) {
      setFaseArchivo("editando");
      setErrorArchivo(err instanceof Error ? err.message : "No se pudo reemplazar el archivo.");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Información y vigencia</CardTitle>
          <CardDescription>
            Cambiar la vigencia renueva un documento vencido sin volver a subirlo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={guardarMetadatos} className="space-y-5" noValidate>
            {errorMeta && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{errorMeta}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="titulo">Título</Label>
              <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} required disabled={guardando} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="descripcion">Descripción</Label>
              <Textarea id="descripcion" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={2000} disabled={guardando} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="etiquetas">Etiquetas (separadas por coma)</Label>
              <Input id="etiquetas" value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)} disabled={guardando} />
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Ventana de vigencia</span>
              <SelectorVigencia valor={vigencia} onChange={setVigencia} deshabilitado={guardando} />
            </div>
            <Button type="submit" disabled={guardando}>
              {guardando ? <Loader2 className="animate-spin" /> : <Save />}
              Guardar cambios
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reemplazar archivo</CardTitle>
          <CardDescription>
            Archivo actual: <strong>{documento.nombre_archivo}</strong> ({formatearBytes(documento.tamano_bytes)}), versión{" "}
            {documento.version}. Al subir uno nuevo la versión pasa a {documento.version + 1} y el anterior se borra.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {documento.purgado ? (
            <p className="text-sm text-muted-foreground">
              Este documento fue purgado. Sube un documento nuevo en lugar de reemplazar este.
            </p>
          ) : (
            <form onSubmit={reemplazar} className="space-y-4" noValidate>
              {errorArchivo && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{errorArchivo}</AlertDescription>
                </Alert>
              )}
              <SelectorArchivo archivo={archivo} onChange={setArchivo} deshabilitado={ocupadoArchivo} etiqueta="Archivo nuevo" />
              {ocupadoArchivo && (
                <BarraProgreso
                  fraccion={faseArchivo === "registrando" ? 1 : progreso}
                  etiqueta={faseArchivo === "subiendo" ? "Subiendo archivo" : "Actualizando versión"}
                />
              )}
              <Button type="submit" variant="outline" disabled={ocupadoArchivo || !archivo}>
                {ocupadoArchivo ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Subir versión nueva
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
