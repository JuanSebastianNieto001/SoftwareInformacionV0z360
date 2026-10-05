"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { actualizarCumple, crearCumple } from "@/app/acciones/cumpleanos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { MESES } from "@/lib/cumpleanos";
import type { Cumple } from "@/lib/supabase/tipos";
import { esquemaCumple, primerError } from "@/lib/validaciones";

const SELECT =
  "h-[40px] w-full rounded-lg border-[1.5px] border-input bg-campo px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-ring/20";

type Props = {
  cumple?: Cumple;
  /** Team leaders que ya existen, para no escribirlos de tres formas. */
  teamLeaders: string[];
  /** Cuentas de la app, para vincular el cumpleaños con la persona. */
  perfiles: { id: string; nombre: string }[];
};

/** Diálogo de crear/editar. Sin `cumple` crea; con `cumple` edita. */
export function FormularioCumple({ cumple, teamLeaders, perfiles }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const vacio = () => ({
    nombre: cumple?.nombre ?? "",
    usuario_id: cumple?.usuario_id ?? "",
    team_leader: cumple?.team_leader ?? "",
    cumple_mes: String(cumple?.cumple_mes ?? ""),
    cumple_dia: String(cumple?.cumple_dia ?? ""),
    anio_nacimiento: cumple?.anio_nacimiento ? String(cumple.anio_nacimiento) : "",
    notas: cumple?.notas ?? "",
    activo: cumple?.activo ?? true,
  });
  const [f, setF] = useState(vacio);
  const set = <K extends keyof ReturnType<typeof vacio>>(k: K, v: ReturnType<typeof vacio>[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = esquemaCumple.safeParse({
      ...f,
      usuario_id: f.usuario_id || null,
      team_leader: f.team_leader || null,
      anio_nacimiento: f.anio_nacimiento === "" ? null : f.anio_nacimiento,
      notas: f.notas || null,
    });
    if (!parsed.success) return setError(primerError(parsed.error));
    iniciar(async () => {
      const r = cumple ? await actualizarCumple(cumple.id, parsed.data) : await crearCumple(parsed.data);
      if (!r.ok) return setError(r.error);
      toast.success(cumple ? "Cumpleaños actualizado" : "Cumpleaños agregado");
      setAbierto(false);
      if (!cumple) setF(vacio());
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        {cumple ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${cumple.nombre}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> Agregar cumpleaños
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{cumple ? "Editar cumpleaños" : "Nuevo cumpleaños"}</DialogTitle>
            <DialogDescription>
              Día y mes son obligatorios. El año, si se conoce, sirve para mostrar la edad que cumple.
            </DialogDescription>
          </DialogHeader>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-1.5">
            <Label htmlFor="c-nombre">Nombre completo</Label>
            <Input
              id="c-nombre"
              value={f.nombre}
              onChange={(e) => set("nombre", e.target.value)}
              maxLength={120}
              required
              autoFocus
              disabled={pendiente}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-dia">Día</Label>
              <Input
                id="c-dia"
                type="number"
                min={1}
                max={31}
                value={f.cumple_dia}
                onChange={(e) => set("cumple_dia", e.target.value)}
                required
                disabled={pendiente}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-mes">Mes</Label>
              <select
                id="c-mes"
                value={f.cumple_mes}
                onChange={(e) => set("cumple_mes", e.target.value)}
                className={SELECT}
                required
                disabled={pendiente}
              >
                <option value="">—</option>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-anio">
                Año <span className="text-muted-foreground">(opc.)</span>
              </Label>
              <Input
                id="c-anio"
                type="number"
                min={1900}
                max={2100}
                value={f.anio_nacimiento}
                onChange={(e) => set("anio_nacimiento", e.target.value)}
                disabled={pendiente}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-tl">
              Team leader <span className="text-muted-foreground">(vacío = estructura)</span>
            </Label>
            <Input
              id="c-tl"
              list="team-leaders"
              value={f.team_leader}
              onChange={(e) => set("team_leader", e.target.value)}
              maxLength={120}
              disabled={pendiente}
            />
            <datalist id="team-leaders">
              {teamLeaders.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-usuario">
              Cuenta en la app <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <select
              id="c-usuario"
              value={f.usuario_id}
              onChange={(e) => set("usuario_id", e.target.value)}
              className={SELECT}
              disabled={pendiente}
            >
              <option value="">Sin vincular</option>
              {perfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-notas">
              Notas <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="c-notas"
              value={f.notas}
              onChange={(e) => set("notas", e.target.value)}
              maxLength={500}
              disabled={pendiente}
            />
          </div>

          {cumple && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={f.activo} onCheckedChange={(v) => set("activo", v === true)} disabled={pendiente} />
              Activo (desmarca si la persona ya no está; no se borra el registro)
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente && <Loader2 className="animate-spin" />}
              {cumple ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
