"use client";

// Diálogo para agregar o editar un indicador del PDA.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { actualizarIndicador, crearIndicador } from "@/app/acciones/pda";
import { SELECT_PDA } from "@/components/pda/estilos";
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
import { ETIQUETA_AGREGACION, ETIQUETA_SENTIDO } from "@/lib/pda";
import type { AgregacionPda, IndicadorPda, SentidoPda } from "@/lib/supabase/tipos";
import { AGREGACIONES_PDA, SENTIDOS_PDA, esquemaIndicadorPda, primerError } from "@/lib/validaciones";

const UNIDADES = ["%", "tickets", "horas", "días", "minutos", "equipos", "actividades", "puntos"];

export function FormularioIndicador({
  planId,
  indicador,
  siguienteOrden = 0,
}: {
  planId: string;
  indicador?: IndicadorPda;
  siguienteOrden?: number;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inicial = () => ({
    nombre: indicador?.nombre ?? "",
    descripcion: indicador?.descripcion ?? "",
    responsable: indicador?.responsable ?? "",
    unidad: indicador?.unidad ?? "%",
    sentido: (indicador?.sentido ?? "mayor") as SentidoPda,
    meta: indicador ? String(indicador.meta) : "",
    agregacion: (indicador?.agregacion ?? "ultimo") as AgregacionPda,
    peso: indicador ? String(indicador.peso) : "1",
    orden: indicador?.orden ?? siguienteOrden,
  });
  const [f, setF] = useState(inicial);
  const set = <K extends keyof ReturnType<typeof inicial>>(k: K, v: ReturnType<typeof inicial>[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = esquemaIndicadorPda.safeParse(f);
    if (!parsed.success) return setError(primerError(parsed.error));
    iniciar(async () => {
      const r = indicador ? await actualizarIndicador(indicador.id, planId, f) : await crearIndicador(planId, f);
      if (!r.ok) return setError(r.error);
      toast.success(indicador ? "Indicador actualizado" : "Indicador agregado");
      setAbierto(false);
      if (!indicador) setF({ ...inicial(), orden: f.orden + 1 });
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        {indicador ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${indicador.nombre}`}>
            <Pencil />
          </Button>
        ) : (
          <Button variant="outline">
            <Plus /> Agregar indicador
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{indicador ? "Editar indicador" : "Nuevo indicador"}</DialogTitle>
            <DialogDescription>
              La meta y el sentido deciden si se cumple. La consolidación dice cómo se juntan las mediciones del mes.
            </DialogDescription>
          </DialogHeader>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-1.5">
            <Label htmlFor="i-nombre">Indicador</Label>
            <Input
              id="i-nombre"
              value={f.nombre}
              onChange={(e) => set("nombre", e.target.value)}
              placeholder="Ej.: Tickets resueltos dentro del SLA"
              maxLength={200}
              autoFocus
              disabled={pendiente}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="i-meta">Meta</Label>
              <Input
                id="i-meta"
                inputMode="decimal"
                value={f.meta}
                onChange={(e) => set("meta", e.target.value)}
                placeholder="95"
                disabled={pendiente}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-unidad">Unidad</Label>
              <Input
                id="i-unidad"
                list="pda-unidades"
                value={f.unidad}
                onChange={(e) => set("unidad", e.target.value)}
                maxLength={30}
                disabled={pendiente}
              />
              <datalist id="pda-unidades">
                {UNIDADES.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="i-sentido">Se cumple cuando el resultado es</Label>
            <select
              id="i-sentido"
              value={f.sentido}
              onChange={(e) => set("sentido", e.target.value as SentidoPda)}
              className={SELECT_PDA}
              disabled={pendiente}
            >
              {SENTIDOS_PDA.map((s) => (
                <option key={s} value={s}>
                  {ETIQUETA_SENTIDO[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="i-agregacion">Consolidación del mes</Label>
              <select
                id="i-agregacion"
                value={f.agregacion}
                onChange={(e) => set("agregacion", e.target.value as AgregacionPda)}
                className={SELECT_PDA}
                disabled={pendiente}
              >
                {AGREGACIONES_PDA.map((a) => (
                  <option key={a} value={a}>
                    {ETIQUETA_AGREGACION[a]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-peso">Peso</Label>
              <Input
                id="i-peso"
                inputMode="decimal"
                value={f.peso}
                onChange={(e) => set("peso", e.target.value)}
                disabled={pendiente}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="i-responsable">
              Responsable <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="i-responsable"
              value={f.responsable}
              onChange={(e) => set("responsable", e.target.value)}
              maxLength={120}
              disabled={pendiente}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="i-descripcion">
              Cómo se mide <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="i-descripcion"
              value={f.descripcion}
              onChange={(e) => set("descripcion", e.target.value)}
              rows={2}
              maxLength={2000}
              disabled={pendiente}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente && <Loader2 className="animate-spin" />}
              {indicador ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
