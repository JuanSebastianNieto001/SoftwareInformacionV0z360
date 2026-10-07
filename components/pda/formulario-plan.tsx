"use client";

// Diálogo para crear o editar el PDA de un mes.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { actualizarPlan, crearPlan } from "@/app/acciones/pda";
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
import { mesActual, nombreMes, periodoAMes } from "@/lib/pda";
import { esquemaPlanPda, primerError } from "@/lib/validaciones";

type PlanEditable = { id: string; periodo: string; titulo: string; objetivo: string | null };

/** Sin `plan` crea (y lleva al PDA nuevo); con `plan` edita. */
export function FormularioPlan({ plan }: { plan?: PlanEditable }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mes, setMes] = useState(plan ? periodoAMes(plan.periodo) : mesActual());
  const [titulo, setTitulo] = useState(plan?.titulo ?? "");
  const [objetivo, setObjetivo] = useState(plan?.objetivo ?? "");

  const tituloPorDefecto = /^\d{4}-\d{2}$/.test(mes) ? `PDA ${nombreMes(`${mes}-01`)}` : "PDA";

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const datos = { periodo: mes, titulo: titulo.trim() || tituloPorDefecto, objetivo };
    const parsed = esquemaPlanPda.safeParse(datos);
    if (!parsed.success) return setError(primerError(parsed.error));
    iniciar(async () => {
      const r = plan ? await actualizarPlan(plan.id, datos) : await crearPlan(datos);
      if (!r.ok) return setError(r.error);
      toast.success(plan ? "PDA actualizado" : "PDA creado");
      setAbierto(false);
      if (!plan && r.id) router.push(`/pda/${r.id}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        {plan ? (
          <Button variant="outline">
            <Pencil /> Editar
          </Button>
        ) : (
          <Button>
            <Plus /> Nuevo PDA del mes
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{plan ? "Editar PDA" : "Nuevo PDA"}</DialogTitle>
            <DialogDescription>
              Un PDA por mes. Después de crearlo agregas sus indicadores con la meta de cada uno.
            </DialogDescription>
          </DialogHeader>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-1.5">
            <Label htmlFor="pda-mes">Mes</Label>
            <Input
              id="pda-mes"
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              placeholder="AAAA-MM"
              required
              disabled={pendiente}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pda-titulo">
              Título <span className="text-muted-foreground">(vacío = «{tituloPorDefecto}»)</span>
            </Label>
            <Input
              id="pda-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={200}
              disabled={pendiente}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pda-objetivo">
              Objetivo del mes <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="pda-objetivo"
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
              rows={3}
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
              {plan ? "Guardar" : "Crear PDA"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
