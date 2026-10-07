"use client";

// Las evidencias de un objetivo: pantallazos, informes y actas. El archivo
// va directo del navegador al bucket privado `pda` (RLS del bucket exige
// Edición sobre el cuadro) y después se registra la fila. Abrir una
// evidencia pasa por /api/pda/evidencias/[id], que firma una URL de 60 s y
// deja rastro en la auditoría.
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FileImage, FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { eliminarEvidencia, registrarEvidencia } from "@/app/acciones/pda";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sanitizarNombreArchivo } from "@/lib/archivos";
import { formatearBytes, formatearFecha } from "@/lib/formato";
import { ACCEPT_EVIDENCIAS_PDA, mimeEvidenciaPorExtension, rutaEvidenciaPda, tipoEvidencia } from "@/lib/pda";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { EvidenciaPda } from "@/lib/supabase/tipos";
import { MIME_PDA, TAMANO_MAXIMO_PDA_BYTES } from "@/lib/validaciones";

export function Evidencias({
  planId,
  objetivoId,
  evidencias,
  editable,
  nombres,
}: {
  planId: string;
  objetivoId: string;
  evidencias: EvidenciaPda[];
  editable: boolean;
  nombres: Record<string, string>;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const entrada = useRef<HTMLInputElement>(null);

  async function subir(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    const supabase = crearClienteNavegador();
    let correctas = 0;
    for (const original of Array.from(archivos)) {
      setSubiendo(original.name);
      try {
        if (original.size === 0) throw new Error(`${original.name}: el archivo está vacío.`);
        if (original.size > TAMANO_MAXIMO_PDA_BYTES) throw new Error(`${original.name}: supera los 25 MB.`);
        const porExtension = mimeEvidenciaPorExtension(original.name);
        const mime = (MIME_PDA as readonly string[]).includes(original.type) ? original.type : porExtension;
        if (!mime) throw new Error(`${original.name}: tipo no permitido. Usa imágenes, PDF, Word, Excel o PowerPoint.`);
        const nombre = sanitizarNombreArchivo(original.name);
        const archivo = original.type === mime ? original : new File([original], nombre, { type: mime });

        const { error } = await supabase.storage.from("pda").upload(rutaEvidenciaPda(planId, objetivoId, nombre), archivo, {
          upsert: false,
          contentType: mime,
        });
        if (error) {
          const m = error.message.toLowerCase();
          if (m.includes("already exists") || m.includes("duplicate")) throw new Error(`${nombre}: ya existe una evidencia con ese nombre.`);
          if (m.includes("row-level security") || m.includes("unauthorized") || m.includes("not allowed")) {
            throw new Error("No tienes permiso de edición en el PDA.");
          }
          throw new Error(`${nombre}: ${error.message}`);
        }

        const r = await registrarEvidencia(planId, {
          objetivo_id: objetivoId,
          nombre_archivo: nombre,
          mime,
          tamano_bytes: archivo.size,
          descripcion,
        });
        if (!r.ok) throw new Error(r.error);
        correctas += 1;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo subir la evidencia.");
      }
    }
    setSubiendo(null);
    if (entrada.current) entrada.current.value = "";
    if (correctas > 0) {
      setDescripcion("");
      toast.success(correctas === 1 ? "Evidencia subida" : `${correctas} evidencias subidas`);
      router.refresh();
    }
  }

  function borrar(ev: EvidenciaPda) {
    setOcupada(ev.id);
    iniciar(async () => {
      const r = await eliminarEvidencia(ev.id, planId);
      setOcupada(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Evidencia retirada");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        Evidencias
        {evidencias.length > 0 && <span className="ml-2 font-normal normal-case tracking-normal tabular-nums">{evidencias.length}</span>}
      </p>

      {evidencias.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {editable ? "Sin evidencias todavía. Sube pantallazos, informes o actas." : "Sin evidencias registradas."}
        </p>
      )}

      {evidencias.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {evidencias.map((ev) => {
            const Icono = ev.mime.startsWith("image/") ? FileImage : FileText;
            const trabajando = pendiente && ocupada === ev.id;
            return (
              <li key={ev.id} className="flex items-start gap-3 px-3 py-2">
                <Icono className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1 text-sm">
                  <a
                    href={`/api/pda/evidencias/${ev.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium break-all hover:underline"
                  >
                    {ev.nombre_archivo}
                  </a>
                  <span className="block text-xs text-muted-foreground">
                    {tipoEvidencia(ev.mime)} · {formatearBytes(ev.tamano_bytes)} · {formatearFecha(ev.creado_en)}
                    {ev.subido_por && nombres[ev.subido_por] && ` · ${nombres[ev.subido_por]}`}
                  </span>
                  {ev.descripcion && <span className="block text-xs text-muted-foreground">{ev.descripcion}</span>}
                </div>
                {trabajando && <Loader2 className="mt-0.5 size-4 animate-spin text-muted-foreground" aria-hidden />}
                {editable && !trabajando && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="-my-1 text-muted-foreground"
                    onClick={() => borrar(ev)}
                    aria-label={`Retirar evidencia ${ev.nombre_archivo}`}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editable && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-2">
          <Input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Descripción para lo que subas (opcional)"
            maxLength={500}
            className="min-w-56 flex-1"
            disabled={subiendo !== null}
          />
          <input
            ref={entrada}
            type="file"
            accept={ACCEPT_EVIDENCIAS_PDA}
            multiple
            className="sr-only"
            onChange={(e) => subir(e.target.files)}
            disabled={subiendo !== null}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => entrada.current?.click()} disabled={subiendo !== null}>
            {subiendo ? <Loader2 className="animate-spin" /> : <Upload />}
            {subiendo ? `Subiendo ${subiendo}…` : "Subir evidencia"}
          </Button>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Paperclip className="size-3" aria-hidden /> Imágenes, PDF, Word, Excel o PowerPoint · hasta 25 MB
          </span>
        </div>
      )}
    </div>
  );
}
