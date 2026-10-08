"use client";

// Cabecera de una auditoría: qué interacción se audita, de quién y con qué
// pauta. Crea (y lleva a la pauta) o edita los datos de una existente.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertCircle, ClipboardList, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { actualizarAuditoria, crearAuditoria } from "@/app/acciones/calidad";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CANALES, ETAPAS_AUDITORIA, ETIQUETA_CANAL, TIPOS_AUDITORIA } from "@/lib/calidad";
import { hoyIso } from "@/lib/formato";
import type { EvaluacionCalidad } from "@/lib/supabase/tipos";
import { esquemaAuditoria, primerError } from "@/lib/validaciones";

const SELECT =
  "h-[46px] w-full rounded-lg border-[1.5px] border-input bg-campo px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-ring/20";

type Props = {
  matrices: { id: string; nombre: string; activa: boolean }[];
  asesores: { id: string; nombre: string; team_leader: string | null; activo: boolean }[];
  /** Con evaluación, el formulario edita en lugar de crear. */
  evaluacion?: EvaluacionCalidad;
};

export function FormularioAuditoria({ matrices, asesores, evaluacion }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const activos = asesores.filter((a) => a.activo || a.id === evaluacion?.asesor_id);
  const [f, setF] = useState(() => ({
    matriz_id: evaluacion?.matriz_id ?? matrices.find((m) => m.activa)?.id ?? matrices[0]?.id ?? "",
    asesor_id: evaluacion?.asesor_id ?? "",
    fecha_interaccion: evaluacion?.fecha_interaccion ?? hoyIso(),
    fecha_auditoria: evaluacion?.fecha_auditoria ?? hoyIso(),
    tipo: evaluacion?.tipo ?? "Venta",
    etapa: evaluacion?.etapa ?? "",
    canal: evaluacion?.canal ?? "llamada",
    referencia: evaluacion?.referencia ?? "",
    duracion: evaluacion?.duracion ?? "",
    detalle: evaluacion?.detalle ?? "",
    puntos_mejora: evaluacion?.puntos_mejora ?? "",
  }));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const asesor = activos.find((a) => a.id === f.asesor_id);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = esquemaAuditoria.safeParse({
      ...f,
      etapa: f.etapa || null,
      referencia: f.referencia || null,
      duracion: f.duracion || null,
      detalle: f.detalle || null,
      puntos_mejora: f.puntos_mejora || null,
    });
    if (!parsed.success) return setError(primerError(parsed.error));
    iniciar(async () => {
      const r = evaluacion ? await actualizarAuditoria(evaluacion.id, parsed.data) : await crearAuditoria(parsed.data);
      if (!r.ok) return setError(r.error);
      if (evaluacion) {
        toast.success("Datos de la auditoría guardados");
        router.refresh();
      } else {
        toast.success("Auditoría creada. Ahora marca la pauta.");
        router.push(`/calidad/evaluaciones/${r.id}`);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="a-asesor">Asesor evaluado</Label>
          <select
            id="a-asesor"
            value={f.asesor_id}
            onChange={(e) => set("asesor_id", e.target.value)}
            className={SELECT}
            disabled={pendiente || !!evaluacion}
            required
          >
            <option value="">Elige al asesor…</option>
            {activos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
                {a.team_leader ? ` · ${a.team_leader}` : ""}
              </option>
            ))}
          </select>
          {asesor?.team_leader && (
            <p className="text-xs text-muted-foreground">Team leader: {asesor.team_leader}</p>
          )}
        </div>

        {!evaluacion && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="a-matriz">Pauta</Label>
            <select id="a-matriz" value={f.matriz_id} onChange={(e) => set("matriz_id", e.target.value)} className={SELECT} disabled={pendiente} required>
              {matrices.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                  {m.activa ? "" : " (inactiva)"}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="a-fi">Fecha de la interacción</Label>
          <Input id="a-fi" type="date" value={f.fecha_interaccion} readOnly disabled aria-describedby="a-fi-ayuda" />
          <p id="a-fi-ayuda" className="text-xs text-muted-foreground">
            Automática: la fecha en que se registra la auditoría.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-fa">Fecha de auditoría</Label>
          <Input id="a-fa" type="date" value={f.fecha_auditoria} onChange={(e) => set("fecha_auditoria", e.target.value)} disabled={pendiente} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-tipo">Tipo</Label>
          <select id="a-tipo" value={f.tipo} onChange={(e) => set("tipo", e.target.value)} className={SELECT} disabled={pendiente}>
            {TIPOS_AUDITORIA.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-etapa">Etapa</Label>
          <select id="a-etapa" value={f.etapa} onChange={(e) => set("etapa", e.target.value)} className={SELECT} disabled={pendiente}>
            <option value="">—</option>
            {ETAPAS_AUDITORIA.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-canal">Canal</Label>
          <select id="a-canal" value={f.canal} onChange={(e) => set("canal", e.target.value)} className={SELECT} disabled={pendiente}>
            {CANALES.map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CANAL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-dur">
            Duración <span className="text-muted-foreground">(mm:ss)</span>
          </Label>
          <Input id="a-dur" value={f.duracion} onChange={(e) => set("duracion", e.target.value)} placeholder="18:12" maxLength={20} disabled={pendiente} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="a-ref">
            Referencia de la interacción <span className="text-muted-foreground">(login, id de llamada…)</span>
          </Label>
          <Input id="a-ref" value={f.referencia} onChange={(e) => set("referencia", e.target.value)} maxLength={120} disabled={pendiente} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="a-det">Detalle de la interacción</Label>
          <Textarea id="a-det" value={f.detalle} onChange={(e) => set("detalle", e.target.value)} rows={4} maxLength={6000} disabled={pendiente} placeholder="Qué pasó en la llamada, con minutos clave…" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="a-pm">Puntos de mejora</Label>
          <Textarea id="a-pm" value={f.puntos_mejora} onChange={(e) => set("puntos_mejora", e.target.value)} rows={3} maxLength={4000} disabled={pendiente} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" disabled={pendiente || (!evaluacion && (!f.asesor_id || !f.matriz_id))}>
          {pendiente ? <Loader2 className="animate-spin" /> : evaluacion ? <Pencil /> : <ClipboardList />}
          {evaluacion ? "Guardar datos" : "Crear y marcar la pauta"}
        </Button>
        {!evaluacion && (
          <Button type="button" variant="ghost" disabled={pendiente} onClick={() => router.back()}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

/** El mismo formulario, en un diálogo, para corregir los datos de una auditoría existente. */
export function DialogoEditarAuditoria(props: Required<Pick<Props, "evaluacion">> & Omit<Props, "evaluacion">) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil /> Editar datos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Datos de la auditoría</DialogTitle>
          <DialogDescription>El asesor y la pauta no cambian; lo demás sí.</DialogDescription>
        </DialogHeader>
        <FormularioAuditoria {...props} />
      </DialogContent>
    </Dialog>
  );
}
