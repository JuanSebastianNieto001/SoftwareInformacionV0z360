import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { FormularioSugerencia } from "@/components/formulario-sugerencia";
import { EncabezadoPagina, EstadoVacio } from "@/components/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ETIQUETA_ESTADO,
  ETIQUETA_TIPO,
  VARIANTE_ESTADO,
  etiquetaArea,
  radicado,
} from "@/lib/buzon";
import { formatearFecha } from "@/lib/formato";
import { exigirSesion } from "@/lib/sesion";

export const metadata: Metadata = { title: "Buzón" };

export default async function PaginaBuzon() {
  const { supabase, user } = await exigirSesion();

  // El filtro por emisor es explicito y no delegado a RLS: el admin puede
  // ver todo, y sin el "Mis registros" le mostraria el buzon entero.
  const { data: mias } = await supabase
    .from("sugerencias")
    .select("id, consecutivo, tipo, proceso, estado, creado_en, respuesta_emisor")
    .eq("emisor_id", user.id)
    .order("creado_en", { ascending: false })
    .limit(50);

  return (
    <>
      <EncabezadoPagina
        kicker="Comunícate con VOZ360"
        titulo="Buzón de sugerencias"
        descripcion="Sugerencias, quejas, felicitaciones y no conformidades. Cada envío queda con número de radicado y se trata según el sistema de gestión de calidad."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <FormularioSugerencia />

        <section className="space-y-3">
          <h2 className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">
            Mis registros
          </h2>

          {!mias || mias.length === 0 ? (
            <EstadoVacio
              icono={<Inbox />}
              titulo="Todavía no has enviado nada"
              descripcion="Lo que envíes aparecerá aquí con su estado."
            />
          ) : (
            <ul className="space-y-2">
              {mias.map((s) => (
                <li key={s.id}>
                  <Card className="rounded-[18px]">
                    <CardContent className="space-y-1.5 px-[18px] py-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {radicado(s.consecutivo)}
                        </span>
                        <Badge variant={VARIANTE_ESTADO[s.estado]}>
                          {ETIQUETA_ESTADO[s.estado]}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium">{ETIQUETA_TIPO[s.tipo]}</p>
                      <p className="text-xs text-muted-foreground">
                        {etiquetaArea(s.proceso)} · {formatearFecha(s.creado_en)}
                      </p>
                      {s.respuesta_emisor && (
                        <p className="rounded-xl bg-zona p-2.5 text-[12.5px] text-marino">
                          {s.respuesta_emisor}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
