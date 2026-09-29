import { ETIQUETA_ESTADO, ETIQUETA_TIPO, etiquetaArea } from "@/lib/buzon";
import type { Sugerencia } from "@/lib/supabase/tipos";

/**
 * Resumen del buzón. Deliberadamente sin librería de gráficas: los datos son
 * conteos sobre pocas categorías, y una barra con su etiqueta y su número al
 * lado se lee mejor —y funciona en impresión y en lector de pantalla— que un
 * donut. Cada fila lleva el texto, así que la identidad nunca depende del
 * color, y al haber una sola serie no hace falta leyenda.
 */

type Fila = { etiqueta: string; total: number };

function agrupar(casos: Sugerencia[], clave: (c: Sugerencia) => string): Fila[] {
  const cuenta = new Map<string, number>();
  for (const c of casos) {
    const k = clave(c);
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([etiqueta, total]) => ({ etiqueta, total }))
    .sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta));
}

function Indicador({
  etiqueta,
  valor,
  detalle,
}: {
  etiqueta: string;
  valor: number;
  detalle?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{valor}</p>
      {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}

function Barras({ titulo, filas }: { titulo: string; filas: Fila[] }) {
  // La escala va contra el mayor, no contra el total: con categorías
  // desiguales, medir contra el total deja todas las barras aplastadas.
  const mayor = Math.max(1, ...filas.map((f) => f.total));

  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin datos todavía.</p>
      ) : (
        <ul className="space-y-1.5">
          {filas.map((f) => (
            <li
              key={f.etiqueta}
              className="grid grid-cols-[minmax(6rem,9rem)_1fr_2.5rem] items-center gap-2 text-sm"
            >
              <span className="truncate text-muted-foreground">{f.etiqueta}</span>
              <span className="h-2 rounded-full bg-muted">
                <span
                  className="block h-2 rounded-full bg-primary"
                  style={{ width: `${(f.total / mayor) * 100}%` }}
                />
              </span>
              <span className="text-right tabular-nums">{f.total}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TableroBuzon({ casos }: { casos: Sugerencia[] }) {
  const total = casos.length;
  const resueltas = casos.filter((c) => c.estado === "cerrada").length;
  const descartadas = casos.filter((c) => c.estado === "rechazada").length;
  const pendientes = total - resueltas - descartadas;
  const porcentaje = total === 0 ? 0 : Math.round((resueltas / total) * 100);

  return (
    <div className="mb-6 space-y-5 rounded-lg border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador etiqueta="Recibidas" valor={total} />
        <Indicador
          etiqueta="Sin resolver"
          valor={pendientes}
          detalle={pendientes === 0 && total > 0 ? "Todo al día" : undefined}
        />
        <Indicador
          etiqueta="Resueltas"
          valor={resueltas}
          detalle={
            total === 0
              ? undefined
              : `${porcentaje}% del total${descartadas > 0 ? ` · ${descartadas} descartada${descartadas === 1 ? "" : "s"}` : ""}`
          }
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Barras
          titulo="Por estado"
          filas={agrupar(casos, (c) => ETIQUETA_ESTADO[c.estado])}
        />
        <Barras
          titulo="Por área de quien reporta"
          filas={agrupar(casos, (c) => etiquetaArea(c.proceso))}
        />
        <Barras titulo="Por tipo" filas={agrupar(casos, (c) => ETIQUETA_TIPO[c.tipo])} />
      </div>
    </div>
  );
}
