"use client";

import { useMemo, useState, useTransition } from "react";
import { Ban, Loader2, Paperclip, Wrench } from "lucide-react";
import { toast } from "sonner";
import { iniciarGestion, rechazarSugerencia, tratarSugerencia } from "@/app/acciones/buzon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { sanitizarNombreArchivo } from "@/lib/archivos";
import {
  ACCEPT_EVIDENCIA,
  ETIQUETA_ESTADO,
  ETIQUETA_TIPO,
  VARIANTE_ESTADO,
  etiquetaArea,
  motivoRechazoEvidencia,
  radicado,
  rutaEvidencia,
} from "@/lib/buzon";
import { formatearFecha } from "@/lib/formato";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { ESTADOS_SUGERENCIA, TIPOS_QUE_EXIGEN_CAUSA } from "@/lib/validaciones";
import type { EstadoSugerencia, Sugerencia } from "@/lib/supabase/tipos";

/** Centinela: Radix Select no admite una opción con value vacío. */
const SIN_ASIGNAR = "ninguno";

export type Persona = { id: string; nombre: string };

/** Tri-estado de la eficacia: aún no se verifica, sirvió, o no sirvió. */
const EFICACIA: Record<string, boolean | null> = {
  pendiente: null,
  si: true,
  no: false,
};

const eficaciaAClave = (v: boolean | null) => (v === null ? "pendiente" : v ? "si" : "no");

export function DialogoTratamiento({
  sugerencia: s,
  personas,
}: {
  sugerencia: Sugerencia;
  personas: Persona[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<EstadoSugerencia>(s.estado);
  const [responsable, setResponsable] = useState(s.responsable_id ?? SIN_ASIGNAR);
  const [causa, setCausa] = useState(s.analisis_causa ?? "");
  const [accion, setAccion] = useState(s.accion_tomada ?? "");
  const [compromiso, setCompromiso] = useState(s.fecha_compromiso ?? "");
  const [eficacia, setEficacia] = useState(eficaciaAClave(s.eficacia_verificada));
  const [notaEficacia, setNotaEficacia] = useState(s.eficacia_nota ?? "");
  const [respuesta, setRespuesta] = useState(s.respuesta_emisor ?? "");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [evidencia, setEvidencia] = useState(s.evidencia_nombre);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const supabase = useMemo(() => crearClienteNavegador(), []);

  // El 10.2 exige el ciclo completo solo cuando hubo incumplimiento. Pedir
  // "análisis de causa" ante una felicitación sería ruido.
  const exigeAccionCorrectiva = TIPOS_QUE_EXIGEN_CAUSA.includes(s.tipo);
  const cerrando = estado === "cerrada";
  const faltaEvidencia = cerrando && !evidencia && !archivo;

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      // El archivo sube primero. Si fallara despues de guardar la fila, la
      // base tendria una evidencia que no existe, que es peor que no poder
      // cerrar el caso.
      let nombre = evidencia;
      if (archivo) {
        const limpio = sanitizarNombreArchivo(archivo.name);
        const { error: fallo } = await supabase.storage
          .from("evidencias")
          .upload(rutaEvidencia(s.id, limpio), archivo, { upsert: true });
        if (fallo) return setError(`No se pudo subir la evidencia: ${fallo.message}`);
        nombre = limpio;
      }

      const r = await tratarSugerencia({
        id: s.id,
        tipo: s.tipo,
        evidencia_nombre: nombre,
        evidencia_nueva: archivo !== null,
        estado,
        responsable_id: responsable === SIN_ASIGNAR ? null : responsable,
        analisis_causa: causa || null,
        accion_tomada: accion || null,
        fecha_compromiso: compromiso || null,
        eficacia_verificada: EFICACIA[eficacia],
        eficacia_nota: notaEficacia || null,
        respuesta_emisor: respuesta || null,
      });
      if (!r.ok) return setError(r.error);
      setEvidencia(nombre);
      setArchivo(null);
      toast.success("Caso actualizado");
      setAbierto(false);
    });
  }

  // Abrir el detalle ya es gestionar: el estado avanza solo, en vez de
  // depender de que alguien se acuerde de cambiarlo en el desplegable. La
  // accion no retrocede casos ya cerrados, filtra por 'recibida'.
  function alCambiarApertura(visible: boolean) {
    setAbierto(visible);
    if (visible && s.estado === "recibida") {
      setEstado("en_proceso");
      iniciar(async () => {
        const r = await iniciarGestion({ id: s.id });
        if (!r.ok) toast.error(r.error);
      });
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={alCambiarApertura}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Wrench /> Gestionar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={guardar} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm">{radicado(s.consecutivo)}</span>
              <Badge variant={VARIANTE_ESTADO[s.estado]}>{ETIQUETA_ESTADO[s.estado]}</Badge>
              <span className="text-sm font-normal text-muted-foreground">
                {ETIQUETA_TIPO[s.tipo]}
              </span>
            </DialogTitle>
            <DialogDescription>
              Enviado por {s.emisor_nombre || s.emisor_email} el {formatearFecha(s.creado_en)}
              {s.desea_respuesta ? " · pidió respuesta" : ""}
            </DialogDescription>
          </DialogHeader>

          {/* Lo que escribió el emisor. Solo lectura, siempre: es la evidencia. */}
          <dl className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Área de quien reporta</dt>
              <dd>
                {etiquetaArea(s.proceso)}
                {s.ocurrido_en ? ` · ocurrió el ${formatearFecha(s.ocurrido_en)}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Qué ocurrió</dt>
              <dd className="whitespace-pre-wrap">{s.descripcion}</dd>
            </div>
            {/* Solo queja y no conformidad lo piden; en el resto no existe. */}
            {s.impacto && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">A quién afecta</dt>
                <dd className="whitespace-pre-wrap">{s.impacto}</dd>
              </div>
            )}
            {s.propuesta && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Propuesta del emisor</dt>
                <dd className="whitespace-pre-wrap">{s.propuesta}</dd>
              </div>
            )}
          </dl>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-estado">Estado</Label>
              <Select
                value={estado}
                onValueChange={(v) => setEstado(v as EstadoSugerencia)}
                disabled={pendiente}
              >
                <SelectTrigger id="t-estado" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS_SUGERENCIA.map((e) => (
                    <SelectItem key={e} value={e}>
                      {ETIQUETA_ESTADO[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="t-responsable">Responsable</Label>
              <Select value={responsable} onValueChange={setResponsable} disabled={pendiente}>
                <SelectTrigger id="t-responsable" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_ASIGNAR}>Sin asignar</SelectItem>
                  {personas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-causa">Análisis de causa</Label>
            <Textarea
              id="t-causa"
              value={causa}
              onChange={(e) => setCausa(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder={
                exigeAccionCorrectiva
                  ? "Por qué ocurrió, no qué ocurrió. Sin causa, la acción es un parche."
                  : "Opcional para este tipo de registro."
              }
              disabled={pendiente}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-accion">Acción tomada</Label>
            <Textarea
              id="t-accion"
              value={accion}
              onChange={(e) => setAccion(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder="Corrección inmediata y, si aplica, acción correctiva para que no se repita."
              disabled={pendiente}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-compromiso">Fecha compromiso</Label>
              <Input
                id="t-compromiso"
                type="date"
                value={compromiso}
                onChange={(e) => setCompromiso(e.target.value)}
                disabled={pendiente}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-eficacia">¿La acción fue eficaz?</Label>
              <Select value={eficacia} onValueChange={setEficacia} disabled={pendiente}>
                <SelectTrigger id="t-eficacia" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Sin verificar</SelectItem>
                  <SelectItem value="si">Sí, el problema no se repitió</SelectItem>
                  <SelectItem value="no">No, hay que replantearla</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {eficacia !== "pendiente" && (
            <div className="space-y-1.5">
              <Label htmlFor="t-nota-eficacia">Cómo se verificó</Label>
              <Textarea
                id="t-nota-eficacia"
                value={notaEficacia}
                onChange={(e) => setNotaEficacia(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Qué se revisó y cuándo para concluirlo."
                disabled={pendiente}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="t-respuesta">Respuesta al emisor</Label>
            <Textarea
              id="t-respuesta"
              value={respuesta}
              onChange={(e) => setRespuesta(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder={
                s.desea_respuesta
                  ? "Pidió respuesta: la verá en su buzón."
                  : "Opcional, salvo que descartes el caso."
              }
              disabled={pendiente}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-evidencia">Prueba de que se respondió por correo</Label>
            <Input
              id="t-evidencia"
              type="file"
              accept={ACCEPT_EVIDENCIA}
              disabled={pendiente}
              onChange={(e) => {
                const elegido = e.target.files?.[0] ?? null;
                const motivo = elegido ? motivoRechazoEvidencia(elegido) : null;
                if (motivo) {
                  setError(motivo);
                  e.target.value = "";
                  return setArchivo(null);
                }
                setError(null);
                setArchivo(elegido);
              }}
            />
            {evidencia && !archivo && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Paperclip className="size-3 shrink-0" aria-hidden />
                <a
                  href={`/api/buzon/${s.id}/evidencia`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {evidencia}
                </a>
                <span>— adjuntar otro archivo lo reemplaza</span>
              </p>
            )}
            {faltaEvidencia && (
              <p className="text-xs text-destructive">
                Sin el pantallazo no se puede cerrar el caso.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAbierto(false)}
              disabled={pendiente}
            >
              Cancelar
            </Button>
            {/*
              El boton se bloquea sin evidencia, pero la regla de verdad esta
              en el CHECK de la base: esto solo evita el viaje en balde.
            */}
            <Button type="submit" disabled={pendiente || faltaEvidencia}>
              {pendiente && <Loader2 className="animate-spin" />}
              {cerrando ? "Responder y cerrar" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Botón "Rechazar". Pide el motivo y nada más: rechazar no es tratar, y
 * obligar a pasar por el formulario largo para descartar un caso sin sentido
 * empujaría a dejarlo pudriéndose en "Sin gestionar".
 */
export function DialogoRechazo({ sugerencia: s }: { sugerencia: Sugerencia }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await rechazarSugerencia({ id: s.id, motivo });
      if (!r.ok) return setError(r.error);
      toast.success("Caso rechazado");
      setAbierto(false);
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Ban /> Rechazar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Rechazar {radicado(s.consecutivo)}</DialogTitle>
            <DialogDescription>
              El motivo queda guardado y lo verá quien presentó la PQR. También es
              lo que se consulta después para saber por qué se desechó.
            </DialogDescription>
          </DialogHeader>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-1.5">
            <Label htmlFor="r-motivo">Motivo del rechazo</Label>
            <Textarea
              id="r-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              maxLength={4000}
              required
              autoFocus
              placeholder="Por ejemplo: el caso está duplicado con BZ-00012, o no corresponde a un proceso de la empresa."
              disabled={pendiente}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAbierto(false)}
              disabled={pendiente}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={pendiente}>
              {pendiente && <Loader2 className="animate-spin" />}
              Rechazar caso
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
