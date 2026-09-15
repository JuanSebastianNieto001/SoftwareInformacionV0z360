"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hoyIso, sumarADia } from "@/lib/formato";
import { cn } from "@/lib/utils";

export type Vigencia = { desde: string; hasta: string }; // "YYYY-MM-DD"; hasta "" = sin vencimiento

const ATAJOS: { etiqueta: string; calcular: (desde: string) => string }[] = [
  { etiqueta: "30 días", calcular: (d) => sumarADia(d, { dias: 30 }) },
  { etiqueta: "90 días", calcular: (d) => sumarADia(d, { dias: 90 }) },
  { etiqueta: "6 meses", calcular: (d) => sumarADia(d, { meses: 6 }) },
  { etiqueta: "1 año", calcular: (d) => sumarADia(d, { meses: 12 }) },
  { etiqueta: "Sin vencimiento", calcular: () => "" },
];

function diasEntre(desde: string, hasta: string): number | null {
  if (!desde || !hasta) return null;
  const a = new Date(`${desde}T00:00:00Z`).getTime();
  const b = new Date(`${hasta}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Selector de ventana de vigencia con atajos: elegir dos fechas a mano es
 * la parte más tediosa del flujo. Usa inputs nativos type=date porque en
 * el celular abren el selector del sistema, mucho más cómodo que un
 * calendario web.
 */
export function SelectorVigencia({
  valor,
  onChange,
  deshabilitado = false,
}: {
  valor: Vigencia;
  onChange: (v: Vigencia) => void;
  deshabilitado?: boolean;
}) {
  const dias = diasEntre(valor.desde, valor.hasta);
  const invalido = valor.hasta !== "" && dias !== null && dias <= 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {ATAJOS.map((atajo) => {
          const objetivo = atajo.calcular(valor.desde || hoyIso());
          const activo = valor.hasta === objetivo;
          return (
            <button
              key={atajo.etiqueta}
              type="button"
              aria-pressed={activo}
              disabled={deshabilitado}
              onClick={() => onChange({ desde: valor.desde || hoyIso(), hasta: objetivo })}
              className={cn(
                "flex h-[38px] items-center rounded-full border-[1.5px] px-4 text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-50",
                activo
                  ? "border-primary bg-tinte font-medium text-marino-suave"
                  : "border-border bg-card text-nav-inactivo hover:border-borde-acento",
              )}
            >
              {atajo.etiqueta}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="vigente_desde">Vigente desde</Label>
          <Input
            id="vigente_desde"
            type="date"
            value={valor.desde}
            disabled={deshabilitado}
            onChange={(e) => onChange({ ...valor, desde: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vigente_hasta">
            Vigente hasta <span className="text-muted-foreground">(vacío = sin vencimiento)</span>
          </Label>
          <Input
            id="vigente_hasta"
            type="date"
            value={valor.hasta}
            min={valor.desde || undefined}
            disabled={deshabilitado}
            aria-invalid={invalido || undefined}
            onChange={(e) => onChange({ ...valor, hasta: e.target.value })}
          />
        </div>
      </div>

      <p className={cn("text-xs", invalido ? "text-destructive" : "text-muted-foreground")}>
        {invalido
          ? "La fecha de vencimiento debe ser posterior a la de inicio."
          : valor.hasta
            ? `Visible para los lectores durante ${dias} ${dias === 1 ? "día" : "días"}. Al vencer desaparece de su vista y 7 días después se borra el archivo.`
            : "Sin vencimiento: el documento seguirá visible hasta que alguien lo edite o lo elimine."}
      </p>
    </div>
  );
}
