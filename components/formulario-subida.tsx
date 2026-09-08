"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertCircle, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { BarraProgreso, SelectorArchivo } from "@/components/selector-archivo";
import { SelectorVigencia, type Vigencia } from "@/components/selector-vigencia";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { construirRutaStorage, sanitizarNombreArchivo } from "@/lib/archivos";
import { finDeDiaIso, hoyIso, inicioDeDiaIso, sumarADia } from "@/lib/formato";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { llamarApi, normalizarArchivo, subirArchivoConProgreso } from "@/lib/subida-cliente";
import { esquemaSubida, primerError } from "@/lib/validaciones";

type AreaOpcion = { id: string; nombre: string };
type Fase = "editando" | "subiendo" | "registrando";

export function FormularioSubida({
  areas,
  areaInicial,
}: {
  areas: AreaOpcion[];
  areaInicial: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => crearClienteNavegador(), []);

  const [areaId, setAreaId] = useState(areaInicial ?? areas[0]?.id ?? "");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [etiquetas, setEtiquetas] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vigencia, setVigencia] = useState<Vigencia>(() => {
    const hoy = hoyIso();
    return { desde: hoy, hasta: sumarADia(hoy, { dias: 90 }) };
  });
  const [fase, setFase] = useState<Fase>("editando");
  const [progreso, setProgreso] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ocupado = fase !== "editando";

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!archivo) return setError("Elige un archivo.");
    const normalizado = normalizarArchivo(archivo);
    if ("error" in normalizado) return setError(normalizado.error);

    const id = crypto.randomUUID();
    const nombre = sanitizarNombreArchivo(normalizado.archivo.name);
    const datos = {
      id,
      area_id: areaId,
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || undefined,
      etiquetas: etiquetas.split(",").map((t) => t.trim()).filter(Boolean),
      nombre_archivo: nombre,
      mime: normalizado.mime,
      tamano_bytes: normalizado.archivo.size,
      vigente_desde: inicioDeDiaIso(vigencia.desde),
      vigente_hasta: vigencia.hasta ? finDeDiaIso(vigencia.hasta) : null,
    };

    // Validación previa en el cliente (la misma que aplicará el servidor).
    const parsed = esquemaSubida.safeParse(datos);
    if (!parsed.success) return setError(primerError(parsed.error));

    const ruta = construirRutaStorage(areaId, id, nombre);

    try {
      setFase("subiendo");
      setProgreso(0);
      // 1) Storage primero. RLS del bucket exige nivel 'edicion' en el área.
      await subirArchivoConProgreso(supabase, ruta, normalizado.archivo, { onProgreso: setProgreso });

      // 2) Metadatos después. Si falla, el servidor borra el archivo subido.
      setFase("registrando");
      await llamarApi<{ id: string }>("/api/documentos/subir", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });

      toast.success("Documento subido");
      router.push(`/documentos/${id}`);
      router.refresh();
    } catch (err) {
      setFase("editando");
      setError(err instanceof Error ? err.message : "No se pudo subir el documento.");
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-6" noValidate>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="area">Área</Label>
        <select
          id="area"
          value={areaId}
          disabled={ocupado}
          onChange={(e) => setAreaId(e.target.value)}
          className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          required
        >
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">Solo aparecen las áreas donde tienes permiso de edición.</p>
      </div>

      <SelectorArchivo archivo={archivo} onChange={setArchivo} deshabilitado={ocupado} />

      <div className="space-y-1.5">
        <Label htmlFor="titulo">Título</Label>
        <Input
          id="titulo"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej.: Lista de precios septiembre 2026"
          maxLength={200}
          disabled={ocupado}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="descripcion">
          Descripción <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <Textarea
          id="descripcion"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={3}
          maxLength={2000}
          disabled={ocupado}
          placeholder="Para qué sirve, a quién aplica, qué cambió respecto a la versión anterior…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="etiquetas">
          Etiquetas <span className="text-muted-foreground">(opcional, separadas por coma)</span>
        </Label>
        <Input
          id="etiquetas"
          value={etiquetas}
          onChange={(e) => setEtiquetas(e.target.value)}
          placeholder="precios, tarifas, 2026"
          disabled={ocupado}
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">Ventana de vigencia</span>
        <SelectorVigencia valor={vigencia} onChange={setVigencia} deshabilitado={ocupado} />
      </div>

      {fase !== "editando" && (
        <BarraProgreso
          fraccion={fase === "registrando" ? 1 : progreso}
          etiqueta={fase === "subiendo" ? "Subiendo archivo" : "Registrando documento"}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" disabled={ocupado || areas.length === 0}>
          {ocupado ? <Loader2 className="animate-spin" /> : <Upload />}
          {fase === "subiendo" ? "Subiendo…" : fase === "registrando" ? "Guardando…" : "Subir documento"}
        </Button>
        <Button type="button" variant="ghost" disabled={ocupado} onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
