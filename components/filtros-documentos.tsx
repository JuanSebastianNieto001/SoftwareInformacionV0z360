import { Search } from "lucide-react";
import { ETIQUETA_ESTADO } from "@/components/estado-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ESTADOS } from "@/lib/validaciones";
import type { EstadoDocumento } from "@/lib/supabase/tipos";

type AreaOpcion = { id: string; nombre: string };

/**
 * Filtros como formulario GET puro (sin JavaScript): funciona en cualquier
 * navegador de celular y deja la búsqueda en la URL para compartirla.
 */
export function FiltrosDocumentos({
  q,
  estado,
  area,
  areas,
  mostrarEstado = true,
  estadosDisponibles = ESTADOS,
  accion,
}: {
  q: string;
  estado: EstadoDocumento | "";
  area?: string;
  areas?: AreaOpcion[];
  mostrarEstado?: boolean;
  estadosDisponibles?: readonly EstadoDocumento[];
  accion?: string;
}) {
  const hayFiltros = q || estado || area;
  return (
    <form method="get" action={accion} className="mb-4 flex flex-wrap items-end gap-2">
      <div className="relative min-w-0 flex-1 basis-56">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por título o descripción"
          className="pl-8"
          aria-label="Buscar"
        />
      </div>

      {areas && areas.length > 0 && (
        <select
          name="area"
          defaultValue={area ?? ""}
          aria-label="Área"
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Todas las áreas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
      )}

      {mostrarEstado && (
        <select
          name="estado"
          defaultValue={estado}
          aria-label="Estado"
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Todos los estados</option>
          {estadosDisponibles.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO[e]}
            </option>
          ))}
        </select>
      )}

      <Button type="submit" variant="secondary">
        Filtrar
      </Button>
      {hayFiltros && (
        <Button type="button" variant="ghost" asChild>
          <a href={accion ?? "?"}>Limpiar</a>
        </Button>
      )}
    </form>
  );
}

/** Quita caracteres que romperían el filtro `or(...)` de PostgREST. */
export function limpiarBusqueda(q: string): string {
  return q.replace(/[,()%_\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}
