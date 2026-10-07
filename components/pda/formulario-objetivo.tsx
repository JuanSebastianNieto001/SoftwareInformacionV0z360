"use client";

// Diálogo para agregar o editar un objetivo: las columnas A–K de la matriz
// del formato (lo que se planea). Las columnas L–N (el cierre) van en
// FormularioCierre.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { actualizarObjetivo, crearObjetivo } from "@/app/acciones/pda";
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
import { Textarea } from "@/components/ui/textarea";
import type { ObjetivoPda } from "@/lib/supabase/tipos";
import { esquemaObjetivoPda, primerError } from "@/lib/validaciones";

/** Un área de texto con su etiqueta. Fuera del formulario para que no se desmonte en cada tecla. */
function CampoTexto({
  id,
  etiqueta,
  ayuda,
  filas = 3,
  max = 3000,
  valor,
  alCambiar,
  disabled,
}: {
  id: string;
  etiqueta: string;
  ayuda?: string;
  filas?: number;
  max?: number;
  valor: string;
  alCambiar: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {etiqueta} {ayuda && <span className="text-muted-foreground">({ayuda})</span>}
      </Label>
      <Textarea id={id} value={valor} onChange={(e) => alCambiar(e.target.value)} rows={filas} maxLength={max} disabled={disabled} />
    </div>
  );
}

export function FormularioObjetivo({
  planId,
  objetivo,
  siguienteOrden = 0,
  responsablePorDefecto = "",
}: {
  planId: string;
  objetivo?: ObjetivoPda;
  siguienteOrden?: number;
  responsablePorDefecto?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inicial = () => ({
    frente: objetivo?.frente ?? "",
    fecha_inicial: objetivo?.fecha_inicial ?? "",
    indicador: objetivo?.indicador ?? "",
    indicador_anterior: objetivo?.indicador_anterior ?? "",
    objetivo: objetivo?.objetivo ?? "",
    causa_raiz: objetivo?.causa_raiz ?? "",
    que_se_hara: objetivo?.que_se_hara ?? "",
    como_se_hara: objetivo?.como_se_hara ?? "",
    recursos: objetivo?.recursos ?? "",
    periodicidad: objetivo?.periodicidad ?? "",
    responsable: objetivo?.responsable ?? responsablePorDefecto,
    proyeccion: objetivo ? String(objetivo.proyeccion) : "100",
    orden: objetivo?.orden ?? siguienteOrden,
  });
  const [f, setF] = useState(inicial);
  const set = <K extends keyof ReturnType<typeof inicial>>(k: K, v: ReturnType<typeof inicial>[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = esquemaObjetivoPda.safeParse(f);
    if (!parsed.success) {
      setError(primerError(parsed.error));
      return;
    }
    iniciar(async () => {
      const r = objetivo ? await actualizarObjetivo(objetivo.id, planId, f) : await crearObjetivo(planId, f);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(objetivo ? "Objetivo actualizado" : "Objetivo agregado");
      setAbierto(false);
      if (!objetivo) setF({ ...inicial(), orden: f.orden + 1 });
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        {objetivo ? (
          <Button variant="ghost" size="icon-sm" aria-label="Editar objetivo">
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> Agregar objetivo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={enviar} className="space-y-5" noValidate>
          <DialogHeader>
            <DialogTitle>{objetivo ? "Editar objetivo" : "Nuevo objetivo del PDA"}</DialogTitle>
            <DialogDescription>
              Una fila de la matriz: el indicador que se medirá, el análisis y el plan para lograrlo. El cierre (datos finales
              y % de cumplimiento) se registra aparte, al terminar el mes.
            </DialogDescription>
          </DialogHeader>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">Qué se mide</legend>
            <div className="space-y-1.5">
              <Label htmlFor="o-indicador">Indicador</Label>
              <Textarea
                id="o-indicador"
                value={f.indicador}
                onChange={(e) => set("indicador", e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Ej.: Registro del 100 % de las solicitudes de soporte en el software de tickets"
                autoFocus
                disabled={pendiente}
              />
            </div>
            <CampoTexto
              disabled={pendiente}
              id="o-anterior"
              etiqueta="Indicador del mes anterior"
              ayuda="opcional"
              filas={2}
              max={1000}
              valor={f.indicador_anterior}
              alCambiar={(v) => set("indicador_anterior", v)}
            />
            <CampoTexto disabled={pendiente} id="o-objetivo" etiqueta="Objetivo (cualitativo)" ayuda="opcional" valor={f.objetivo} alCambiar={(v) => set("objetivo", v)} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="o-fecha">Fecha inicial</Label>
                <Input id="o-fecha" type="date" value={f.fecha_inicial} onChange={(e) => set("fecha_inicial", e.target.value)} disabled={pendiente} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-frente">
                  Frente <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="o-frente"
                  value={f.frente}
                  onChange={(e) => set("frente", e.target.value)}
                  placeholder="Ej.: Software de tickets"
                  maxLength={200}
                  disabled={pendiente}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-proyeccion">Proyección de cumplimiento (%)</Label>
                <Input
                  id="o-proyeccion"
                  inputMode="decimal"
                  value={f.proyeccion}
                  onChange={(e) => set("proyeccion", e.target.value)}
                  disabled={pendiente}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">Análisis</legend>
            <CampoTexto disabled={pendiente} id="o-causa" etiqueta="Análisis de causa raíz" ayuda="opcional" valor={f.causa_raiz} alCambiar={(v) => set("causa_raiz", v)} />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">Plan</legend>
            <CampoTexto disabled={pendiente} id="o-que" etiqueta="¿Qué se hará?" ayuda="opcional" valor={f.que_se_hara} alCambiar={(v) => set("que_se_hara", v)} />
            <CampoTexto disabled={pendiente} id="o-como" etiqueta="¿Cómo se hará?" ayuda="opcional" valor={f.como_se_hara} alCambiar={(v) => set("como_se_hara", v)} />
            <CampoTexto
              disabled={pendiente}
              id="o-recursos"
              etiqueta="¿Con qué recursos?"
              ayuda="opcional"
              filas={2}
              max={2000}
              valor={f.recursos}
              alCambiar={(v) => set("recursos", v)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoTexto
                disabled={pendiente}
                id="o-periodicidad"
                etiqueta="Periodicidad"
                ayuda="opcional"
                filas={2}
                max={1000}
                valor={f.periodicidad}
                alCambiar={(v) => set("periodicidad", v)}
              />
              <div className="space-y-1.5">
                <Label htmlFor="o-responsable">
                  Responsable <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="o-responsable" value={f.responsable} onChange={(e) => set("responsable", e.target.value)} maxLength={160} disabled={pendiente} />
              </div>
            </div>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente && <Loader2 className="animate-spin" />}
              {objetivo ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
