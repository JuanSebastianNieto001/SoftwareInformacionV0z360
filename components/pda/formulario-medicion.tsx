"use client";

// Diálogo para registrar una medición de un indicador.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Ruler } from "lucide-react";
import { toast } from "sonner";
import { registrarMedicion } from "@/app/acciones/pda";
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
import { hoyIso } from "@/lib/formato";
import { ETIQUETA_AGREGACION, SIMBOLO_SENTIDO, conUnidad } from "@/lib/pda";
import type { IndicadorPda } from "@/lib/supabase/tipos";
import { esquemaMedicionPda, primerError } from "@/lib/validaciones";

export function FormularioMedicion({ planId, indicador }: { planId: string; indicador: IndicadorPda }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fecha, setFecha] = useState(hoyIso);
  const [valor, setValor] = useState("");
  const [observacion, setObservacion] = useState("");

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const datos = { indicador_id: indicador.id, fecha, valor, observacion };
    const parsed = esquemaMedicionPda.safeParse(datos);
    if (!parsed.success) return setError(primerError(parsed.error));
    iniciar(async () => {
      const r = await registrarMedicion(planId, datos);
      if (!r.ok) return setError(r.error);
      toast.success("Medición registrada");
      setAbierto(false);
      setValor("");
      setObservacion("");
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Ruler /> Medir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Registrar medición</DialogTitle>
            <DialogDescription>
              {indicador.nombre} · meta {SIMBOLO_SENTIDO[indicador.sentido]}{" "}
              {conUnidad(indicador.meta, indicador.unidad)}. {ETIQUETA_AGREGACION[indicador.agregacion]}.
            </DialogDescription>
          </DialogHeader>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="m-fecha">Fecha</Label>
              <Input id="m-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={pendiente} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-valor">Valor ({indicador.unidad})</Label>
              <Input
                id="m-valor"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                autoFocus
                disabled={pendiente}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="m-obs">
              Observación <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="m-obs"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              maxLength={1000}
              disabled={pendiente}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente && <Loader2 className="animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
