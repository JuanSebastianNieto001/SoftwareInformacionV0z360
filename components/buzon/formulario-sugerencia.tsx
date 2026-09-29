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
import { AYUDA_TIPO, ETIQUETA_AREA_REPORTE, ETIQUETA_TIPO, TEXTOS_TIPO } from "@/lib/buzon";
import { hoyIso } from "@/lib/formato";
import { AREAS_REPORTE, CAMPOS_POR_TIPO, TIPOS_SUGERENCIA } from "@/lib/validaciones";
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

  // Qué se pide y cómo se pregunta lo decide el tipo elegido. La tabla de
  // exigencias es la misma que usa el esquema en el servidor, así que el
  // formulario no puede ocultar un campo que luego se vaya a rechazar.
  const campos = CAMPOS_POR_TIPO[f.tipo];
  const textos = TEXTOS_TIPO[f.tipo];

  /**
   * Al cambiar de tipo se borra lo que el tipo nuevo ya no pregunta.
   *
   * El esquema también lo limpia antes de guardar, pero hacerlo aquí evita
   * que un texto escrito para una queja reaparezca si se vuelve a ese tipo
   * después de haber pasado por felicitación: lo que se ve es lo que se
   * envía, sin sobrantes escondidos.
   */
  function cambiarTipo(valor: string) {
    const tipo = valor as TipoSugerencia;
    const nuevos = CAMPOS_POR_TIPO[tipo];
    setF((prev) => ({
      ...prev,
      tipo,
      impacto: nuevos.impacto === "oculto" ? "" : prev.impacto,
      propuesta: nuevos.propuesta === "oculto" ? "" : prev.propuesta,
      desea_respuesta: nuevos.desea_respuesta ? prev.desea_respuesta : false,
    }));
    setError(null);
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await enviarSugerencia({
        ...f,
        ocurrido_en: f.ocurrido_en || null,
        impacto: f.impacto || null,
        propuesta: f.propuesta || null,
      });
      if (!r.ok) return setError(r.error);
      toast.success("Registro enviado. Queda con número de radicado.");
      setF(VACIO);
    });
  }

  return (
    <Card className="rounded-[24px] p-6 sm:p-8">
      <CardHeader className="p-0">
        <CardTitle className="text-xl">Nuevo registro</CardTitle>
        <CardDescription>
          Describe hechos concretos: qué pasó, dónde y cuándo. Lo que escribas aquí
          no se puede editar después, porque es lo que sirve de evidencia.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <form onSubmit={enviar} className="space-y-[22px]" noValidate>
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-1.5">
            <Label htmlFor="s-tipo">Tipo de registro</Label>
            <Select value={f.tipo} onValueChange={cambiarTipo} disabled={pendiente}>
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
            <p className="text-xs text-atenuado">{AYUDA_TIPO[f.tipo]}</p>
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
            <Label htmlFor="s-descripcion">{textos.descripcion.etiqueta}</Label>
            <Textarea
              id="s-descripcion"
              value={f.descripcion}
              onChange={(e) => set("descripcion", e.target.value)}
              rows={5}
              maxLength={4000}
              required
              placeholder={textos.descripcion.ayuda}
              disabled={pendiente}
            />
          </div>

          {campos.impacto !== "oculto" && (
            <div className="space-y-1.5">
              <Label htmlFor="s-impacto">{textos.impacto.etiqueta}</Label>
              <Textarea
                id="s-impacto"
                value={f.impacto}
                onChange={(e) => set("impacto", e.target.value)}
                rows={2}
                maxLength={1000}
                required
                placeholder={textos.impacto.ayuda}
                disabled={pendiente}
              />
            </div>
          )}

          {campos.propuesta !== "oculto" && (
            <div className="space-y-1.5">
              <Label htmlFor="s-propuesta">{textos.propuesta.etiqueta}</Label>
              <Textarea
                id="s-propuesta"
                value={f.propuesta}
                onChange={(e) => set("propuesta", e.target.value)}
                rows={3}
                maxLength={2000}
                required={campos.propuesta === "obligatorio"}
                placeholder={textos.propuesta.ayuda}
                disabled={pendiente}
              />
            </div>
          )}

          {campos.desea_respuesta && (
            <div className="flex items-start gap-2">
              <Checkbox
                className="size-[22px] rounded-[7px] border-borde-acento"
                id="s-respuesta"
                checked={f.desea_respuesta}
                onCheckedChange={(v) => set("desea_respuesta", v === true)}
                disabled={pendiente}
              />
              <Label htmlFor="s-respuesta" className="text-sm leading-tight font-normal">
                Quiero que se me responda cuando el caso se cierre
              </Label>
            </div>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={pendiente}>
            {pendiente ? <Loader2 className="animate-spin" /> : <Send />}
            {pendiente ? "Enviando…" : "Enviar al buzón"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
