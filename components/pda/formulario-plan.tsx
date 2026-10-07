"use client";

// Diálogo para crear o editar el PDA de un mes: la cabecera del formato
// (mes, cargo, responsable, título, código y versión) y los textos del
// documento «Plan de trabajo» (antecedentes, objetivo general, entregables).
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
import { CARGOS_PDA, mesActual, nombreMes, periodoAMes } from "@/lib/pda";
import type { PlanPda } from "@/lib/supabase/tipos";
import { esquemaPlanPda, primerError } from "@/lib/validaciones";

type PlanEditable = Pick<
  PlanPda,
  "id" | "periodo" | "cargo" | "responsable" | "titulo" | "codigo" | "version" | "antecedentes" | "objetivo_general" | "entregables"
>;

/** Sin `plan` crea (y lleva al PDA nuevo); con `plan` edita. `sugerencia` precarga cargo y responsable. */
export function FormularioPlan({
  plan,
  sugerencia,
  compacto = false,
}: {
  plan?: PlanEditable;
  sugerencia?: { cargo?: string; responsable?: string; mes?: string };
  compacto?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inicial = () => ({
    mes: plan ? periodoAMes(plan.periodo) : (sugerencia?.mes ?? mesActual()),
    cargo: plan?.cargo ?? sugerencia?.cargo ?? "",
    responsable: plan?.responsable ?? sugerencia?.responsable ?? "",
    titulo: plan?.titulo ?? "",
    codigo: plan?.codigo ?? "FTM-SINF-005",
    version: plan?.version ?? "1.0",
    antecedentes: plan?.antecedentes ?? "",
    objetivo_general: plan?.objetivo_general ?? "",
    entregables: plan?.entregables ?? "",
  });
  const [f, setF] = useState(inicial);
  const set = <K extends keyof ReturnType<typeof inicial>>(k: K, v: ReturnType<typeof inicial>[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const tituloPorDefecto = /^\d{4}-\d{2}$/.test(f.mes)
    ? `PDA ${nombreMes(`${f.mes}-01`)}${f.cargo ? ` · ${f.cargo}` : ""}`
    : "PDA";

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const datos = { ...f, periodo: f.mes, titulo: f.titulo.trim() || tituloPorDefecto };
    const parsed = esquemaPlanPda.safeParse(datos);
    if (!parsed.success) {
      setError(primerError(parsed.error));
      return;
    }
    iniciar(async () => {
      const r = plan ? await actualizarPlan(plan.id, datos) : await crearPlan(datos);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(plan ? "PDA actualizado" : "PDA creado: ahora agrega sus objetivos");
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
            <Pencil /> Editar cabecera
          </Button>
        ) : compacto ? (
          <Button variant="outline" size="sm">
            <Plus /> Crear
          </Button>
        ) : (
          <Button>
            <Plus /> Nuevo PDA
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{plan ? "Editar el PDA" : "Nuevo PDA del mes"}</DialogTitle>
            <DialogDescription>
              Un PDA por mes y por cargo. Después de crearlo agregas los objetivos de la matriz, cada uno con su lista de
              chequeo y sus evidencias.
            </DialogDescription>
          </DialogHeader>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-mes">Mes</Label>
              <Input id="p-mes" type="month" value={f.mes} onChange={(e) => set("mes", e.target.value)} required disabled={pendiente} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-codigo">Código del formato</Label>
              <Input id="p-codigo" value={f.codigo} onChange={(e) => set("codigo", e.target.value)} maxLength={40} disabled={pendiente} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-version">Versión</Label>
              <Input id="p-version" value={f.version} onChange={(e) => set("version", e.target.value)} maxLength={20} disabled={pendiente} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <div className="space-y-1.5">
              <Label htmlFor="p-cargo">Cargo</Label>
              <Input
                id="p-cargo"
                list="pda-cargos"
                value={f.cargo}
                onChange={(e) => set("cargo", e.target.value)}
                placeholder="Líder de TI"
                maxLength={80}
                disabled={pendiente}
              />
              <datalist id="pda-cargos">
                {CARGOS_PDA.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-responsable">Responsable</Label>
              <Input
                id="p-responsable"
                value={f.responsable}
                onChange={(e) => set("responsable", e.target.value)}
                placeholder="Nombre completo - cargo"
                maxLength={160}
                disabled={pendiente}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-titulo">
              Título <span className="text-muted-foreground">(vacío = «{tituloPorDefecto}»)</span>
            </Label>
            <Input id="p-titulo" value={f.titulo} onChange={(e) => set("titulo", e.target.value)} maxLength={300} disabled={pendiente} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-antecedentes">
              Antecedentes <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="p-antecedentes"
              value={f.antecedentes}
              onChange={(e) => set("antecedentes", e.target.value)}
              rows={3}
              maxLength={6000}
              disabled={pendiente}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-objetivo">
              Objetivo general <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="p-objetivo"
              value={f.objetivo_general}
              onChange={(e) => set("objetivo_general", e.target.value)}
              rows={3}
              maxLength={4000}
              disabled={pendiente}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-entregables">
              Entregables <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="p-entregables"
              value={f.entregables}
              onChange={(e) => set("entregables", e.target.value)}
              rows={2}
              maxLength={4000}
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
