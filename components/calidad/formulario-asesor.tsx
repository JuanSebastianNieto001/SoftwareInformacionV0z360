"use client";

// Alta y edición de una persona de la estructura operativa (asesor y su team leader).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { actualizarAsesor, crearAsesor } from "@/app/acciones/calidad";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AsesorCalidad } from "@/lib/supabase/tipos";
import { esquemaAsesorCalidad, primerError } from "@/lib/validaciones";

const SELECT =
  "h-[40px] w-full rounded-lg border-[1.5px] border-input bg-campo px-3 text-sm outline-none focus-visible:border-primary";

export function FormularioAsesor({ asesor, teamLeaders, perfiles }: { asesor?: AsesorCalidad; teamLeaders: string[]; perfiles: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    nombre: asesor?.nombre ?? "",
    cedula: asesor?.cedula ?? "",
    team_leader: asesor?.team_leader ?? "",
    campana: asesor?.campana ?? "",
    fecha_contratacion: asesor?.fecha_contratacion ?? "",
    usuario_id: asesor?.usuario_id ?? "",
    activo: asesor?.activo ?? true,
  });

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = esquemaAsesorCalidad.safeParse({
      ...f,
      cedula: f.cedula || null,
      team_leader: f.team_leader || null,
      campana: f.campana || null,
      fecha_contratacion: f.fecha_contratacion || null,
      usuario_id: f.usuario_id || null,
    });
    if (!parsed.success) return setError(primerError(parsed.error));
    iniciar(async () => {
      const r = asesor ? await actualizarAsesor(asesor.id, parsed.data) : await crearAsesor(parsed.data);
      if (!r.ok) return setError(r.error);
      toast.success(asesor ? "Guardado" : "Agregado a la estructura");
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        {asesor ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${asesor.nombre}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> Agregar persona
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{asesor ? "Editar" : "Nueva persona en la estructura"}</DialogTitle>
            <DialogDescription>Vincular la cuenta de la app permite que la persona vea sus auditorías y firme su retroalimentación.</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="as-nombre">Nombre completo</Label>
            <Input id="as-nombre" value={f.nombre} onChange={(e) => setF((p) => ({ ...p, nombre: e.target.value }))} maxLength={120} required autoFocus disabled={pendiente} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="as-ced">Cédula</Label>
              <Input id="as-ced" value={f.cedula} onChange={(e) => setF((p) => ({ ...p, cedula: e.target.value }))} inputMode="numeric" maxLength={15} disabled={pendiente} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="as-fc">Fecha de contratación</Label>
              <Input id="as-fc" type="date" value={f.fecha_contratacion} onChange={(e) => setF((p) => ({ ...p, fecha_contratacion: e.target.value }))} disabled={pendiente} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="as-tl">Team leader</Label>
              <Input id="as-tl" list="tls-estructura" value={f.team_leader} onChange={(e) => setF((p) => ({ ...p, team_leader: e.target.value }))} maxLength={120} disabled={pendiente} />
              <datalist id="tls-estructura">
                {teamLeaders.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="as-camp">Campaña</Label>
              <Input id="as-camp" value={f.campana} onChange={(e) => setF((p) => ({ ...p, campana: e.target.value }))} maxLength={120} disabled={pendiente} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="as-usuario">Cuenta en la app</Label>
            <select id="as-usuario" value={f.usuario_id} onChange={(e) => setF((p) => ({ ...p, usuario_id: e.target.value }))} className={SELECT} disabled={pendiente}>
              <option value="">Sin vincular</option>
              {perfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          {asesor && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={f.activo} onCheckedChange={(v) => setF((p) => ({ ...p, activo: v === true }))} disabled={pendiente} /> Activo (desmarca si ya no está en la operación)
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente && <Loader2 className="animate-spin" />}
              {asesor ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
