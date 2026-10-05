"use client";

// Formulario de una respuesta de la matriz 360.
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertCircle, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { crearRespuesta360 } from "@/app/acciones/evaluacion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  COMPETENCIAS_360,
  ESCALA_360,
  ETIQUETA_PERSPECTIVA,
  calcular360,
  estatus360,
  formatearNota,
  varianteNota,
} from "@/lib/evaluacion";
import { hoyIso } from "@/lib/formato";
import type { CargoEvaluacion, Pregunta360 } from "@/lib/supabase/tipos";
import { PERSPECTIVAS_360, esquemaRespuesta360, primerError } from "@/lib/validaciones";

type Props = {
  cargos: Pick<CargoEvaluacion, "id" | "nombre">[];
  preguntas: Pregunta360[];
  /** Nombre de quien está conectado: es el evaluador por defecto. */
  evaluadorPorDefecto: string;
};

/**
 * Una fila de la hoja "Evaluaciones": quién evalúa a quién, desde qué
 * perspectiva, y las doce preguntas. Las columnas calculadas (promedio,
 * estatus, una media por competencia) se ven mientras se escribe, igual
 * que en la hoja.
 */
export function Formulario360({ cargos, preguntas, evaluadorPorDefecto }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const vacio = () => ({
    cargo_id: cargos[0]?.id ?? "",
    evaluado_nombre: "",
    evaluador_nombre: evaluadorPorDefecto,
    evaluador_cargo: "",
    perspectiva: "" as string,
    fecha: hoyIso(),
    comentarios: "",
    respuestas: Array<string>(12).fill(""),
  });
  const [f, setF] = useState(vacio);

  const set = <K extends keyof ReturnType<typeof vacio>>(k: K, v: ReturnType<typeof vacio>[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const numeros = useMemo(
    () => f.respuestas.map((r) => (r.trim() === "" ? null : Number(r))),
    [f.respuestas],
  );
  const calculo = useMemo(() => calcular360(numeros), [numeros]);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const datos = {
      ...f,
      evaluador_cargo: f.evaluador_cargo || null,
      comentarios: f.comentarios || null,
      respuestas: numeros,
    };
    // La misma validación que aplica el servidor, para avisar antes de enviar.
    const parsed = esquemaRespuesta360.safeParse(datos);
    if (!parsed.success) return setError(primerError(parsed.error));

    iniciar(async () => {
      const r = await crearRespuesta360(parsed.data);
      if (!r.ok) return setError(r.error);
      toast.success("Respuesta registrada");
      setF(vacio());
      router.refresh();
    });
  }

  return (
    <Card className="rounded-[24px] p-6 sm:p-8">
      <CardHeader className="p-0">
        <CardTitle className="text-xl">Nueva respuesta 360°</CardTitle>
        <CardDescription>
          Escala: {ESCALA_360.map((e) => `${e.valor} = ${e.etiqueta}`).join(" · ")}. Admite medios
          puntos (3,5).
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pt-6">
        <form onSubmit={enviar} className="space-y-6" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="evaluado">Evaluado</Label>
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
            <div className="space-y-1.5">
              <Label htmlFor="evaluador-cargo">
                Cargo del evaluador <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="evaluador-cargo"
                value={f.evaluador_cargo}
                onChange={(e) => set("evaluador_cargo", e.target.value)}
                placeholder="Gerente de Operaciones"
                maxLength={120}
                disabled={pendiente}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cargo evaluado</Label>
              <Select value={f.cargo_id} onValueChange={(v) => set("cargo_id", v)} disabled={pendiente}>
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
            </div>
            <div className="space-y-1.5">
              <Label>Perspectiva 360°</Label>
              <Select value={f.perspectiva} onValueChange={(v) => set("perspectiva", v)} disabled={pendiente}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="¿Desde dónde evalúa?" />
                </SelectTrigger>
                <SelectContent>
                  {PERSPECTIVAS_360.map((p) => (
                    <SelectItem key={p} value={p}>
                      {ETIQUETA_PERSPECTIVA[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fecha">Fecha</Label>
              <Input
                id="fecha"
                type="date"
                value={f.fecha}
                onChange={(e) => set("fecha", e.target.value)}
                disabled={pendiente}
                required
              />
            </div>
          </div>

          {COMPETENCIAS_360.map((comp) => (
            <fieldset key={comp.clave} className="space-y-3 rounded-[18px] border bg-zona/40 p-4">
              <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
                {comp.nombre}
                <Badge variant={varianteNota(calculo.competencias[comp.clave])}>
                  {formatearNota(calculo.competencias[comp.clave])}
                </Badge>
              </legend>
              {comp.preguntas.map((i) => {
                const pregunta = preguntas[i];
                if (!pregunta) return null;
                return (
                  <div
                    key={pregunta.codigo}
                    className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]"
                  >
                    <Label htmlFor={`p-${pregunta.codigo}`} className="font-normal leading-snug">
                      <span className="mr-1.5 font-mono text-xs text-muted-foreground">{pregunta.codigo}</span>
                      {pregunta.pregunta}
                    </Label>
                    <Input
                      id={`p-${pregunta.codigo}`}
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={5}
                      step={0.5}
                      value={f.respuestas[i] ?? ""}
                      onChange={(e) => {
                        const copia = [...f.respuestas];
                        copia[i] = e.target.value;
                        set("respuestas", copia);
                      }}
                      disabled={pendiente}
                      required
                      className="text-center"
                    />
                  </div>
                );
              })}
            </fieldset>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="comentarios">
              Comentarios / plan de acción <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="comentarios"
              value={f.comentarios}
              onChange={(e) => set("comentarios", e.target.value)}
              rows={3}
              maxLength={2000}
              disabled={pendiente}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-tinte px-4 py-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Puntaje promedio</span>{" "}
              <span className="text-lg font-semibold tabular-nums">{formatearNota(calculo.promedio)}</span>
              {calculo.promedio !== null && (
                <Badge className="ml-2" variant={varianteNota(calculo.promedio)}>
                  {estatus360(calculo.promedio)}
                </Badge>
              )}
            </div>
            <Button type="submit" size="lg" disabled={pendiente || cargos.length === 0}>
              {pendiente ? <Loader2 className="animate-spin" /> : <Send />}
              {pendiente ? "Guardando…" : "Registrar respuesta"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
