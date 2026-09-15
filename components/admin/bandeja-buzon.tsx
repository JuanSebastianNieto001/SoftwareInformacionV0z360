"use client";

import { useState } from "react";
import { DialogoRechazo, DialogoTratamiento, type Persona } from "./gestion-sugerencias";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ETIQUETA_ESTADO, ETIQUETA_TIPO, VARIANTE_ESTADO, etiquetaArea, radicado } from "@/lib/buzon";
import { formatearFecha } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { ESTADOS_SUGERENCIA } from "@/lib/validaciones";
import type { EstadoSugerencia, Sugerencia } from "@/lib/supabase/tipos";

type Filtro = "todas" | EstadoSugerencia;

const FILTROS: Filtro[] = ["todas", ...ESTADOS_SUGERENCIA];

/**
 * Bandeja de PQR. El filtrado es en el cliente sobre los casos ya cargados:
 * son cientos como mucho, y así cambiar de pestaña es instantáneo en vez de
 * costar un viaje al servidor por clic.
 */
export function BandejaBuzon({
  casos,
  personas,
}: {
  casos: Sugerencia[];
  personas: Persona[];
}) {
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const cuenta = (f: Filtro) =>
    f === "todas" ? casos.length : casos.filter((c) => c.estado === f).length;

  const visibles = filtro === "todas" ? casos : casos.filter((c) => c.estado === filtro);

  // En la pestaña de rechazadas lo que se viene a consultar es el porqué, así
  // que el motivo sustituye a las columnas de clasificación.
  const viendoRechazadas = filtro === "rechazada";

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            aria-pressed={filtro === f}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              filtro === f
                ? "border-foreground bg-foreground text-background"
                : "text-muted-foreground hover:border-foreground/30",
            )}
          >
            {f === "todas" ? "Todas" : ETIQUETA_ESTADO[f]}{" "}
            <span className="tabular-nums">{cuenta(f)}</span>
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No hay casos en esta pestaña.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Radicado</TableHead>
                <TableHead>Tipo</TableHead>
                {viendoRechazadas ? (
                  <TableHead>Motivo del rechazo</TableHead>
                ) : (
                  <>
                    <TableHead className="hidden md:table-cell">Área</TableHead>
                    <TableHead className="hidden sm:table-cell">Quién</TableHead>
                    <TableHead className="hidden lg:table-cell">Recibido</TableHead>
                  </>
                )}
                <TableHead>Estado</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {radicado(c.consecutivo)}
                  </TableCell>
                  <TableCell>{ETIQUETA_TIPO[c.tipo]}</TableCell>

                  {viendoRechazadas ? (
                    <TableCell className="max-w-md text-sm text-muted-foreground">
                      {c.respuesta_emisor ?? "—"}
                    </TableCell>
                  ) : (
                    <>
                      <TableCell className="hidden max-w-40 truncate md:table-cell">
                        {etiquetaArea(c.proceso)}
                      </TableCell>
                      <TableCell className="hidden max-w-40 truncate sm:table-cell">
                        {c.emisor_nombre || c.emisor_email}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap lg:table-cell">
                        {formatearFecha(c.creado_en)}
                      </TableCell>
                    </>
                  )}

                  <TableCell>
                    <Badge variant={VARIANTE_ESTADO[c.estado]}>{ETIQUETA_ESTADO[c.estado]}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <DialogoTratamiento sugerencia={c} personas={personas} />
                      {/* Un caso cerrado o ya rechazado no se rechaza otra vez. */}
                      {c.estado !== "cerrada" && c.estado !== "rechazada" && (
                        <DialogoRechazo sugerencia={c} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
