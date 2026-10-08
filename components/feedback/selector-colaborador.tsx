"use client";

// Buscador del colaborador: filtra mientras se escribe entre los asesores
// registrados en la estructura y marca quiénes tienen cuenta vinculada (esos
// pueden firmar en línea desde «Mis feedback»). También acepta un nombre
// libre para alguien que no esté en la lista (un líder, por ejemplo).
import { useMemo, useState } from "react";
import { PenLine, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ColaboradorOpcion = { nombre: string; team_leader: string | null; con_cuenta: boolean };

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function SelectorColaborador({
  opciones,
  valor,
  alCambiar,
  disabled = false,
}: {
  opciones: ColaboradorOpcion[];
  valor: string;
  /** Al teclear llega solo el nombre; al elegir de la lista, también su team leader. */
  alCambiar: (nombre: string, teamLeader?: string | null) => void;
  disabled?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);

  // Sin tope: al abrir se ve la lista completa (con scroll) y se va
  // acotando con cada letra.
  const filtradas = useMemo(() => {
    const q = normalizar(valor.trim());
    return q ? opciones.filter((o) => normalizar(o.nombre).includes(q)) : opciones;
  }, [opciones, valor]);

  const exacto = opciones.find((o) => normalizar(o.nombre) === normalizar(valor.trim()));

  return (
    <div className="relative">
      <Input
        id="f-colab"
        value={valor}
        onChange={(e) => {
          alCambiar(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        placeholder="Escribe para filtrar entre los asesores registrados…"
        maxLength={160}
        autoComplete="off"
        disabled={disabled}
        role="combobox"
        aria-expanded={abierto && filtradas.length > 0}
        aria-controls="f-colab-lista"
      />
      {abierto && filtradas.length > 0 && (
        <ul id="f-colab-lista" role="listbox" className="absolute z-20 mt-1 max-h-96 w-full overflow-y-auto rounded-xl border bg-card p-1 shadow-lg">
          {filtradas.map((o) => (
            <li key={o.nombre} role="option" aria-selected={o.nombre === valor}>
              <button
                type="button"
                // onMouseDown para elegir antes de que el blur cierre la lista.
                onMouseDown={(e) => {
                  e.preventDefault();
                  alCambiar(o.nombre, o.team_leader);
                  setAbierto(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-tinte",
                  o.nombre === valor && "bg-tinte",
                )}
              >
                <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{o.nombre}</span>
                  {o.team_leader && <span className="block truncate text-xs text-muted-foreground">{o.team_leader}</span>}
                </span>
                {o.con_cuenta ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                    <PenLine className="size-3" aria-hidden /> firma en línea
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">sin cuenta</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {exacto
          ? exacto.con_cuenta
            ? "Tiene cuenta vinculada: podrá firmar el feedback desde «Mis feedback»."
            : "Sin cuenta vinculada: registra tú su firma durante la sesión."
          : valor.trim()
            ? "Nombre libre (no está en la estructura): registra tú su firma durante la sesión."
            : "Elige de la lista o escribe un nombre libre."}
      </p>
    </div>
  );
}
