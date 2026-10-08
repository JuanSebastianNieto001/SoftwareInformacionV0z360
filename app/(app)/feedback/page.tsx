// Panel de retroalimentación: indicadores del periodo, feedback por tipo y la
// lista con filtros. El cálculo sale de v_feedback (RLS decide qué filas).
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MessageSquareHeart } from "lucide-react";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ETIQUETA_CONFORMIDAD,
  ETIQUETA_ESTADO_FEEDBACK,
  ETIQUETA_GRAVEDAD,
  varianteConformidad,
  varianteEstadoFeedback,
  varianteGravedad,
} from "@/lib/feedback";
import { formatearFecha } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos-acceso";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Feedback" };

export default async function PaginaFeedback({ searchParams }: PageProps<"/feedback">) {
  const sp = await searchParams;
  const { supabase, puedeEditar } = await exigirModulo("feedback");
  const tipo = typeof sp.tipo === "string" ? sp.tipo : "";
  const ESTADOS = ["abierto", "en_seguimiento", "cerrado", "reincidente"] as const;
  const estado = ESTADOS.find((e) => e === sp.estado) ?? "";

  let consulta = supabase.from("v_feedback").select("*").order("fecha", { ascending: false }).limit(2000);
  if (tipo) consulta = consulta.eq("tipo", tipo);
  if (estado) consulta = consulta.eq("estado", estado);
  const { data } = await consulta;
  const lista = data ?? [];

  const abiertos = lista.filter((f) => f.estado === "abierto" || f.estado === "en_seguimiento").length;
  const vencidos = lista.filter((f) => f.seguimiento_vencido).length;
  const sinConf = lista.filter((f) => f.sin_conformidad).length;
  const positivos = lista.filter((f) => f.es_positivo).length;

  // Conteo por tipo para las pastillas de filtro.
  const tipos = new Map<string, number>();
  for (const f of lista) tipos.set(f.tipo, (tipos.get(f.tipo) ?? 0) + 1);

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(tipo ? { tipo } : {}), ...(estado ? { estado } : {}), ...extra });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/feedback?${p.toString()}`;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">Resumen</h2>
        {puedeEditar && (
          <Button asChild size="sm">
            <Link href="/feedback/nuevo">
              <MessageSquareHeart /> Nuevo feedback
            </Link>
          </Button>
        )}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador etiqueta="Registros" valor={String(lista.length)} detalle={`${positivos} reconocimientos`} />
        <Indicador etiqueta="Abiertos / en seguimiento" valor={String(abiertos)} tono={abiertos > 0 ? "alerta" : "neutro"} />
        <Indicador etiqueta="Seguimientos vencidos" valor={String(vencidos)} tono={vencidos > 0 ? "alerta" : "neutro"} />
        <Indicador etiqueta="Sin compromiso y firma" valor={String(sinConf)} detalle="El colaborador aún no deja su compromiso ni firma" tono={sinConf > 0 ? "alerta" : "neutro"} />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Tipo:</span>
        <Link href={qs({ tipo: "" })} className={cn("rounded-full border px-3 py-1 text-[13px] font-medium", !tipo ? "border-primary bg-primary text-primary-foreground" : "bg-card text-nav-inactivo hover:border-borde-acento hover:text-primary")}>
          Todos
        </Link>
        {[...tipos.entries()].map(([t, n]) => (
          <Link key={t} href={qs({ tipo: t })} className={cn("rounded-full border px-3 py-1 text-[13px] font-medium", tipo === t ? "border-primary bg-primary text-primary-foreground" : "bg-card text-nav-inactivo hover:border-borde-acento hover:text-primary")}>
            {t} ({n})
          </Link>
        ))}
        <form method="get" action="/feedback" className="ml-auto flex items-center gap-2">
          {tipo && <input type="hidden" name="tipo" value={tipo} />}
          <select name="estado" defaultValue={estado} className="h-[36px] rounded-lg border-[1.5px] border-input bg-campo px-2 text-sm" aria-label="Estado">
            <option value="">Todos los estados</option>
            {(["abierto", "en_seguimiento", "cerrado", "reincidente"] as const).map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_FEEDBACK[e]}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="sm">
            Filtrar
          </Button>
        </form>
      </div>

      {lista.length === 0 ? (
        <EstadoVacio icono={<MessageSquareHeart />} titulo="Sin feedback registrado" descripcion={puedeEditar ? "Registra el primero con «Nuevo feedback»." : "Cuando se registre feedback aparecerá aquí."} />
      ) : (
        <div className="overflow-x-auto rounded-[20px] border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Gravedad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Compromiso y firma</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatearFecha(`${f.fecha}T12:00:00-05:00`)}</TableCell>
                  <TableCell>
                    <Link href={`/feedback/${f.id}`} className="font-medium hover:underline">
                      {f.colaborador_nombre}
                    </Link>
                    {f.team_leader && <span className="block text-xs text-muted-foreground">{f.team_leader}</span>}
                  </TableCell>
                  <TableCell className="max-w-72">
                    <span className="text-xs text-muted-foreground">{f.tipo} · {f.subtipo}</span>
                    <span className="block leading-snug">
                      {f.detalle}
                      {f.es_positivo && (
                        <Badge variant="outline" className="ml-1 border-emerald-300 text-emerald-700 align-middle">
                          reconocimiento
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={varianteGravedad(f.gravedad)}>{ETIQUETA_GRAVEDAD[f.gravedad]}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-col gap-1">
                      <Badge variant={varianteEstadoFeedback(f.estado)}>{ETIQUETA_ESTADO_FEEDBACK[f.estado]}</Badge>
                      {f.seguimiento_vencido && <span className="text-xs font-medium text-red-700">seguimiento vencido</span>}
                    </span>
                  </TableCell>
                  <TableCell>
                    {f.conformidad ? (
                      <Badge variant={varianteConformidad(f.conformidad)}>✍️ {ETIQUETA_CONFORMIDAD[f.conformidad]}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">pendiente del colaborador</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="icon-sm" aria-label={`Abrir feedback de ${f.colaborador_nombre}`}>
                      <Link href={`/feedback/${f.id}`}>
                        <ChevronRight />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Indicador({ etiqueta, valor, detalle, tono = "neutro" }: { etiqueta: string; valor: string; detalle?: string; tono?: "neutro" | "alerta" }) {
  return (
    <Card className="rounded-[20px]">
      <CardContent className="px-[18px] py-4">
        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{etiqueta}</p>
        <p className={cn("mt-1 text-[26px] leading-tight font-semibold tabular-nums", tono === "alerta" && valor !== "0" && "text-destructive")}>{valor}</p>
        {detalle && <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>}
      </CardContent>
    </Card>
  );
}
