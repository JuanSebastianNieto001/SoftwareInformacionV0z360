"use client";

// Diálogo para registrar el cierre de un objetivo: las columnas L–N del
// formato (datos al final de mes, % de cumplimiento y observación).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cerrarObjetivo } from "@/app/acciones/pda";
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
import { esquemaCierreObjetivoPda, primerError } from "@/lib/validaciones";

const ATAJOS = [0, 25, 50, 75, 100];

export function FormularioCierre({ planId, objetivo }: { planId: string; objetivo: ObjetivoPda }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState(objetivo.datos_cierre ?? "");
  const [cumplimiento, setCumplimiento] = useState(objetivo.cumplimiento === null ? "" : String(objetivo.cumplimiento));
  const [observacion, setObservacion] = useState(objetivo.observacion ?? "");
  const yaCerrado = objetivo.cumplimiento !== null;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const d = { datos_cierre: datos, cumplimiento, observacion };
    const parsed = esquemaCierreObjetivoPda.safeParse(d);
    if (!parsed.success) {
      setError(primerError(parsed.error));
      return;
    }
    iniciar(async () => {
      const r = await cerrarObjetivo(objetivo.id, planId, d);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(cumplimiento === "" ? "Cierre retirado: el objetivo vuelve a estar en curso" : "Cierre del objetivo registrado");
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm" variant={yaCerrado ? "outline" : "default"}>
          <Flag /> {yaCerrado ? "Editar cierre" : "Registrar cierre"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Cierre del objetivo</DialogTitle>
            <DialogDescription>
              {objetivo.indicador}. Proyectado: {Number(objetivo.proyeccion)} %.
            </DialogDescription>
          </DialogHeader>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-1.5">
            <Label htmlFor="c-datos">Datos al final de mes</Label>
            <Textarea
              id="c-datos"
              value={datos}
              onChange={(e) => setDatos(e.target.value)}
              rows={4}
              maxLength={3000}
              placeholder="Qué se logró, con cifras: «6 de 6 módulos en operación», «42 solicitudes registradas»…"
              autoFocus
              disabled={pendiente}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-cumplimiento">
              % de cumplimiento <span className="text-muted-foreground">(vacío = sigue en curso)</span>
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="c-cumplimiento"
                inputMode="decimal"
                value={cumplimiento}
                onChange={(e) => setCumplimiento(e.target.value)}
                className="w-28"
                disabled={pendiente}
              />
              {ATAJOS.map((a) => (
                <Button
                  key={a}
                  type="button"
                  size="sm"
                  variant={cumplimiento === String(a) ? "default" : "outline"}
                  onClick={() => setCumplimiento(String(a))}
                  disabled={pendiente}
                >
                  {a} %
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-obs">
              Observación <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="c-obs"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              rows={3}
              maxLength={3000}
              placeholder="Qué faltó, qué se hizo de más, qué pasa al mes siguiente…"
              disabled={pendiente}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente && <Loader2 className="animate-spin" />}
              Guardar cierre
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
