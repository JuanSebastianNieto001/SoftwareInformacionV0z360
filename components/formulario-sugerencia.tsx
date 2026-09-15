"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { enviarSugerencia } from "@/app/acciones/buzon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { AYUDA_TIPO, ETIQUETA_AREA_REPORTE, ETIQUETA_TIPO } from "@/lib/buzon";
import { hoyIso } from "@/lib/formato";
import { AREAS_REPORTE, TIPOS_SUGERENCIA } from "@/lib/validaciones";
import type { TipoSugerencia } from "@/lib/supabase/tipos";

const VACIO = {
  tipo: "sugerencia" as TipoSugerencia,
  proceso: "",
  ocurrido_en: "",
  descripcion: "",
  impacto: "",
  propuesta: "",
  desea_respuesta: false,
};

export function FormularioSugerencia() {
  const [f, setF] = useState(VACIO);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const set = <K extends keyof typeof VACIO>(k: K, v: (typeof VACIO)[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await enviarSugerencia({
        ...f,
        ocurrido_en: f.ocurrido_en || null,
        propuesta: f.propuesta || null,
      });
      if (!r.ok) return setError(r.error);
      toast.success("Registro enviado. Queda con número de radicado.");
      setF(VACIO);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuevo registro</CardTitle>
        <CardDescription>
          Describe hechos concretos: qué pasó, dónde y cuándo. Lo que escribas aquí
          no se puede editar después, porque es lo que sirve de evidencia.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-1.5">
            <Label htmlFor="s-tipo">Tipo de registro</Label>
            <Select
              value={f.tipo}
              onValueChange={(v) => set("tipo", v as TipoSugerencia)}
              disabled={pendiente}
            >
              <SelectTrigger id="s-tipo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_SUGERENCIA.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ETIQUETA_TIPO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{AYUDA_TIPO[f.tipo]}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-proceso">Proceso o área de quien reporta</Label>
              {/*
                Sin valor por defecto: Radix no admite un value vacío, así que
                se pasa undefined para que salga el marcador de posición. Si no
                se elige nada, el esquema lo rechaza con su propio mensaje. Un
                valor preseleccionado acabaría firmando PQR con un cargo que
                nadie miró.
              */}
              <Select
                value={f.proceso || undefined}
                onValueChange={(v) => set("proceso", v)}
                disabled={pendiente}
              >
                <SelectTrigger id="s-proceso" className="w-full">
                  <SelectValue placeholder="Selecciona…" />
                </SelectTrigger>
                <SelectContent>
                  {AREAS_REPORTE.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ETIQUETA_AREA_REPORTE[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-fecha">¿Cuándo ocurrió? (opcional)</Label>
              <Input
                id="s-fecha"
                type="date"
                value={f.ocurrido_en}
                max={hoyIso()}
                onChange={(e) => set("ocurrido_en", e.target.value)}
                disabled={pendiente}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="s-descripcion">¿Qué ocurrió?</Label>
            <Textarea
              id="s-descripcion"
              value={f.descripcion}
              onChange={(e) => set("descripcion", e.target.value)}
              rows={5}
              maxLength={4000}
              required
              placeholder="Hechos, no opiniones: qué pasó, en qué punto del proceso y quiénes intervinieron."
              disabled={pendiente}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="s-impacto">¿A quién o a qué afecta?</Label>
            <Textarea
              id="s-impacto"
              value={f.impacto}
              onChange={(e) => set("impacto", e.target.value)}
              rows={2}
              maxLength={1000}
              required
              placeholder="Al cliente, al servicio, a un compañero, a un documento del sistema…"
              disabled={pendiente}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="s-propuesta">¿Cómo lo mejorarías? (opcional)</Label>
            <Textarea
              id="s-propuesta"
              value={f.propuesta}
              onChange={(e) => set("propuesta", e.target.value)}
              rows={3}
              maxLength={2000}
              disabled={pendiente}
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="s-respuesta"
              checked={f.desea_respuesta}
              onCheckedChange={(v) => set("desea_respuesta", v === true)}
              disabled={pendiente}
            />
            <Label htmlFor="s-respuesta" className="text-sm leading-tight font-normal">
              Quiero que se me responda cuando el caso se cierre
            </Label>
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={pendiente}>
            {pendiente ? <Loader2 className="animate-spin" /> : <Send />}
            {pendiente ? "Enviando…" : "Enviar al buzón"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
