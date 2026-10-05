"use client";

// Alta de una evaluación por cargo (la cabecera de la hoja).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertCircle, ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { crearEvaluacion } from "@/app/acciones/evaluacion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { hoyIso } from "@/lib/formato";
import type { CargoEvaluacion } from "@/lib/supabase/tipos";
import { esquemaEvaluacionNueva, primerError } from "@/lib/validaciones";

type Props = {
  cargos: Pick<CargoEvaluacion, "id" | "nombre" | "etiqueta_evaluado" | "campana_defecto">[];
  evaluadorPorDefecto: { nombre: string; cargo: string | null };
};

/**
 * La cabecera de una hoja de cargo (filas 4 y 5): a quién se evalúa, en
 * qué cargo y campaña, cuándo y quién evalúa. Al guardar se abre la hoja
 * para calificar.
 */
export function FormularioEvaluacionNueva({ cargos, evaluadorPorDefecto }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState(() => ({
    cargo_id: cargos[0]?.id ?? "",
    periodo: String(new Date().getFullYear()),
    evaluado_nombre: "",
    campana: cargos[0]?.campana_defecto ?? "",
    fecha_evaluacion: hoyIso(),
    evaluador_nombre: evaluadorPorDefecto.nombre,
    evaluador_cargo: evaluadorPorDefecto.cargo ?? "",
  }));

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const cargo = cargos.find((c) => c.id === f.cargo_id);

  // Al cambiar de cargo se propone su campaña por defecto (Team Leader y
  // Asesores traen "Claro Colombia" en la hoja), sin pisar lo ya escrito.
  function cambiarCargo(id: string) {
    const nuevo = cargos.find((c) => c.id === id);
    setF((prev) => ({
      ...prev,
      cargo_id: id,
      campana: prev.campana.trim() === "" || prev.campana === cargo?.campana_defecto
        ? (nuevo?.campana_defecto ?? "")
        : prev.campana,
    }));
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = esquemaEvaluacionNueva.safeParse({
      ...f,
      campana: f.campana || null,
      evaluador_cargo: f.evaluador_cargo || null,
    });
    if (!parsed.success) return setError(primerError(parsed.error));

    iniciar(async () => {
      const r = await crearEvaluacion(parsed.data);
      if (!r.ok) return setError(r.error);
      toast.success("Evaluación creada. Ahora califica cada criterio.");
      router.push(`/evaluacion/formatos/${r.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-[22px] rounded-[24px] border bg-card p-6 sm:p-8" noValidate>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label>Cargo evaluado</Label>
        <Select value={f.cargo_id} onValueChange={cambiarCargo} disabled={pendiente}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Elige el cargo" />
          </SelectTrigger>
          <SelectContent>
            {cargos.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Cada cargo tiene sus 12 criterios propios, tomados del formato de Gestión Humana.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="evaluado">Nombre del {cargo?.etiqueta_evaluado?.toLowerCase() ?? "evaluado"}</Label>
          <Input
            id="evaluado"
            value={f.evaluado_nombre}
            onChange={(e) => set("evaluado_nombre", e.target.value)}
            placeholder="Nombre completo"
            maxLength={120}
            disabled={pendiente}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="campana">
            Campaña / cuenta <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id="campana"
            value={f.campana}
            onChange={(e) => set("campana", e.target.value)}
            maxLength={120}
            disabled={pendiente}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="periodo">Periodo</Label>
          <Input
            id="periodo"
            value={f.periodo}
            onChange={(e) => set("periodo", e.target.value)}
            placeholder="2026"
            maxLength={20}
            disabled={pendiente}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fecha">Fecha de evaluación</Label>
          <Input
            id="fecha"
            type="date"
            value={f.fecha_evaluacion}
            onChange={(e) => set("fecha_evaluacion", e.target.value)}
            disabled={pendiente}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="evaluador">Evaluador</Label>
          <Input
            id="evaluador"
            value={f.evaluador_nombre}
            onChange={(e) => set("evaluador_nombre", e.target.value)}
            maxLength={120}
            disabled={pendiente}
            required
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="evaluador-cargo">
            Cargo del evaluador <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id="evaluador-cargo"
            value={f.evaluador_cargo}
            onChange={(e) => set("evaluador_cargo", e.target.value)}
            placeholder="Gerente de RRHH"
            maxLength={120}
            disabled={pendiente}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" disabled={pendiente || cargos.length === 0}>
          {pendiente ? <Loader2 className="animate-spin" /> : <ClipboardList />}
          {pendiente ? "Creando…" : "Crear y calificar"}
        </Button>
        <Button type="button" variant="ghost" disabled={pendiente} onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
