"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { actualizarArea, cambiarEstadoArea, crearArea } from "@/app/(admin)/admin/acciones";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type AreaEditable = { id: string; nombre: string; descripcion: string };

/** Diálogo de crear/editar área. Sin `area` crea; con `area` edita. */
export function FormularioArea({ area }: { area?: AreaEditable }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(area?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(area?.descripcion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = area
        ? await actualizarArea(area.id, { nombre, descripcion })
        : await crearArea({ nombre, descripcion });
      if (!r.ok) return setError(r.error);
      toast.success(area ? "Área actualizada" : "Área creada");
      setAbierto(false);
      if (!area) {
        setNombre("");
        setDescripcion("");
      }
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        {area ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${area.nombre}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> Nueva área
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{area ? "Editar área" : "Nueva área"}</DialogTitle>
            <DialogDescription>
              {area
                ? "El identificador de la URL no cambia para no romper enlaces."
                : "El nombre debe ser único. La URL se genera automáticamente."}
            </DialogDescription>
          </DialogHeader>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-1.5">
            <Label htmlFor="nombre-area">Nombre</Label>
            <Input
              id="nombre-area"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={80}
              required
              autoFocus
              disabled={pendiente}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc-area">Descripción (opcional)</Label>
            <Textarea
              id="desc-area"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              maxLength={500}
              disabled={pendiente}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente && <Loader2 className="animate-spin" />}
              {area ? "Guardar" : "Crear área"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InterruptorArea({ id, activa, nombre }: { id: string; activa: boolean; nombre: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Switch
      checked={activa}
      disabled={pendiente}
      aria-label={`${activa ? "Desactivar" : "Activar"} ${nombre}`}
      onCheckedChange={(valor) =>
        iniciar(async () => {
          const r = await cambiarEstadoArea(id, valor);
          if (!r.ok) toast.error(r.error);
          else toast.success(valor ? "Área activada" : "Área desactivada");
        })
      }
    />
  );
}
