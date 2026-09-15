import { Search } from "lucide-react";
import { ETIQUETA_ESTADO } from "@/components/estado-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ESTADOS } from "@/lib/validaciones";
import type { EstadoDocumento } from "@/lib/supabase/tipos";

type AreaOpcion = { id: string; nombre: string };

const CLASE_SELECT =
  "h-[46px] rounded-lg border-[1.5px] border-input bg-campo px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-ring/20";

/**
 * Filtros como formulario GET puro (sin JavaScript): funciona en cualquier
 * navegador de celular y deja la búsqueda en la URL para compartirla.
 *
 * El estado usa radios y no un desplegable, que es lo que le da el aspecto
 * de control segmentado del diseño sin dejar de ser un formulario GET: la
 * pastilla es la etiqueta del radio, no un botón con JavaScript detrás.
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
    <form method="get" action={accion} className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 basis-56">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-atenuado" />
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por título o descripción"
          className="pl-[42px]"
          aria-label="Buscar"
        />
      </div>

      {areas && areas.length > 0 && (
        <select name="area" defaultValue={area ?? ""} aria-label="Área" className={CLASE_SELECT}>
          <option value="">Todas las áreas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
      )}

      {mostrarEstado && (
        <fieldset className="flex flex-wrap items-center gap-1 rounded-lg border-[1.5px] bg-card p-1">
          <legend className="sr-only">Estado</legend>
          <OpcionEstado valor="" etiqueta="Todos" actual={estado} />
          {estadosDisponibles.map((e) => (
            <OpcionEstado key={e} valor={e} etiqueta={ETIQUETA_ESTADO[e]} actual={estado} />
          ))}
        </fieldset>
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

function OpcionEstado({
  valor,
  etiqueta,
  actual,
}: {
  valor: string;
  etiqueta: string;
  actual: string;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="radio"
        name="estado"
        value={valor}
        defaultChecked={actual === valor}
        className="peer sr-only"
      />
      <span className="flex h-9 items-center rounded-[10px] px-3 text-[13px] text-nav-inactivo transition-colors peer-focus-visible:ring-3 peer-focus-visible:ring-ring/30 peer-checked:bg-marino peer-checked:font-medium peer-checked:text-white">
        {etiqueta}
      </span>
    </label>
  );
}

/** Quita caracteres que romperían el filtro `or(...)` de PostgREST. */
export function limpiarBusqueda(q: string): string {
  return q.replace(/[,()%_\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}
