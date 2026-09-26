"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { asignarPermiso } from "@/app/(admin)/admin/acciones";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ETIQUETA_NIVEL, ETIQUETA_ROL, nivelEfectivo } from "@/lib/permisos";
import type { NivelAcceso, RolGlobal } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

type Usuario = { id: string; nombre: string; cargo: string | null; rol: RolGlobal; activo: boolean };
type Area = { id: string; nombre: string; activa: boolean };
type Permiso = { usuario_id: string; area_id: string; nivel: NivelAcceso };
type Grupo = { id: string; nombre: string; activo: boolean };
type Miembro = { grupo_id: string; usuario_id: string };
type PermisoGrupo = { grupo_id: string; area_id: string; nivel: NivelAcceso };

/** De menor a mayor, igual que el enum nivel_acceso en Postgres. */
const ORDEN: readonly NivelAcceso[] = ["lectura", "descarga", "edicion", "total"];

/**
 * Los cinco estados posibles de una persona en un área, de menos a más.
 *
 * Es una escalera y no una lista de casillas sueltas: cada peldaño incluye
 * todo lo del anterior. Así no existe "puede eliminar pero no puede leer",
 * que es la clase de permiso que nadie concede a propósito y que luego
 * nadie entiende al auditar.
 */
const OPCIONES: { valor: NivelAcceso | null; etiqueta: string; ayuda: string }[] = [
  { valor: null, etiqueta: "Sin acceso", ayuda: "No ve el área." },
  { valor: "lectura", etiqueta: "Solo leer", ayuda: "Abre los documentos en pantalla." },
  { valor: "descarga", etiqueta: "Descargar", ayuda: "Los abre y además los baja." },
  { valor: "edicion", etiqueta: "Editar", ayuda: "Sube documentos nuevos y modifica los existentes." },
  { valor: "total", etiqueta: "Todos", ayuda: "Todo lo anterior y además eliminar." },
];

export function MatrizPermisos({
  usuarios,
  areas,
  permisos,
  grupos,
  miembros,
  permisosGrupo,
  usuarioInicial,
}: {
  usuarios: Usuario[];
  areas: Area[];
  permisos: Permiso[];
  grupos: Grupo[];
  miembros: Miembro[];
  permisosGrupo: PermisoGrupo[];
  usuarioInicial: string | null;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState<string | null>(
    usuarioInicial && usuarios.some((u) => u.id === usuarioInicial) ? usuarioInicial : usuarios[0]?.id ?? null,
  );
  // Estado local optimista: { "usuario|area": nivel }
  const [locales, setLocales] = useState<Map<string, NivelAcceso | null>>(new Map());
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const [, iniciar] = useTransition();

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return usuarios.filter((u) => !q || u.nombre.toLowerCase().includes(q) || (u.cargo ?? "").toLowerCase().includes(q));
  }, [usuarios, busqueda]);

  const usuario = usuarios.find((u) => u.id === seleccionado) ?? null;

  /**
   * Lo mejor que le conceden sus grupos activos sobre esa área, con el
   * nombre del grupo que lo concede. Sin esto la pantalla mentiría: un
   * asesor sin permiso propio saldría como "Sin acceso" aunque entre todos
   * los días por lo que hereda de su segmento.
   */
  function porGrupo(usuarioId: string, areaId: string): { nivel: NivelAcceso; grupo: string } | null {
    let mejor: { nivel: NivelAcceso; grupo: string } | null = null;
    for (const m of miembros) {
      if (m.usuario_id !== usuarioId) continue;
      const g = grupos.find((x) => x.id === m.grupo_id);
      if (!g || !g.activo) continue;
      const pg = permisosGrupo.find((p) => p.grupo_id === m.grupo_id && p.area_id === areaId);
      if (!pg) continue;
      if (!mejor || ORDEN.indexOf(pg.nivel) > ORDEN.indexOf(mejor.nivel)) {
        mejor = { nivel: pg.nivel, grupo: g.nombre };
      }
    }
    return mejor;
  }

  function nivelDe(usuarioId: string, areaId: string): NivelAcceso | null {
    const clave = `${usuarioId}|${areaId}`;
    if (locales.has(clave)) return locales.get(clave) ?? null;
    return permisos.find((p) => p.usuario_id === usuarioId && p.area_id === areaId)?.nivel ?? null;
  }

  function cambiar(areaId: string, nivel: NivelAcceso | null) {
    if (!usuario) return;
    const clave = `${usuario.id}|${areaId}`;
    const anterior = nivelDe(usuario.id, areaId);
    setLocales((m) => new Map(m).set(clave, nivel));
    setOcupados((s) => new Set(s).add(clave));
    iniciar(async () => {
      const r = await asignarPermiso({ usuario_id: usuario.id, area_id: areaId, nivel });
      setOcupados((s) => {
        const n = new Set(s);
        n.delete(clave);
        return n;
      });
      if (!r.ok) {
        setLocales((m) => new Map(m).set(clave, anterior));
        toast.error(r.error);
      }
    });
  }

  // Cuenta las áreas a las que llega, por permiso propio o por grupo.
  const cuentaPermisos = (u: Usuario) =>
    areas.filter((a) => nivelDe(u.id, a.id) !== null || porGrupo(u.id, a.id) !== null).length;

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      {/* Lista de usuarios */}
      <aside className="rounded-lg border">
        <div className="relative border-b p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar persona"
            className="pl-8"
            aria-label="Buscar persona"
          />
        </div>
        {/* Móvil: select. Escritorio: lista. */}
        <div className="p-2 md:hidden">
          <select
            value={seleccionado ?? ""}
            onChange={(e) => setSeleccionado(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
            aria-label="Persona"
          >
            {filtrados.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre || "(sin nombre)"} · {ETIQUETA_ROL[u.rol]}
              </option>
            ))}
          </select>
        </div>
        <ul className="hidden max-h-[60vh] overflow-y-auto p-1 md:block">
          {filtrados.length === 0 && (
            <li className="px-3 py-4 text-sm text-muted-foreground">Sin coincidencias.</li>
          )}
          {filtrados.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => setSeleccionado(u.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted",
                  seleccionado === u.id && "bg-secondary font-medium",
                  !u.activo && "opacity-60",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{u.nombre || "(sin nombre)"}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {ETIQUETA_ROL[u.rol]}
                    {u.cargo ? ` · ${u.cargo}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {u.rol === "admin" ? "todas" : `${cuentaPermisos(u)}/${areas.length}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Áreas del usuario seleccionado */}
      <section className="rounded-lg border">
        {!usuario ? (
          <p className="p-6 text-sm text-muted-foreground">Selecciona una persona.</p>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-2 border-b p-3">
              <h2 className="font-medium">{usuario.nombre || "(sin nombre)"}</h2>
              <Badge variant={usuario.rol === "admin" ? "default" : "secondary"}>{ETIQUETA_ROL[usuario.rol]}</Badge>
              {!usuario.activo && <Badge variant="destructive">Desactivado</Badge>}
              {usuario.rol === "admin" && (
                <p className="basis-full text-xs text-muted-foreground">
                  Los administradores tienen edición en todas las áreas; las asignaciones de abajo no les afectan.
                </p>
              )}
              {usuario.rol === "lector" && (
                <p className="basis-full text-xs text-muted-foreground">
                  Como es lector, «Editar» y «Todos» se aplicarán como descarga mientras no cambie su rol.
                </p>
              )}
            </header>
            <ul className="divide-y">
              {areas.map((a) => {
                const nivel = nivelDe(usuario.id, a.id);
                const efectivo = nivelEfectivo(usuario.rol, usuario.activo, nivel);
                const heredado = porGrupo(usuario.id, a.id);
                const clave = `${usuario.id}|${a.id}`;
                const ocupado = ocupados.has(clave);
                return (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <span className={cn("block text-sm", !a.activa && "text-muted-foreground line-through")}>
                        {a.nombre}
                      </span>
                      {efectivo !== nivel && nivel !== null && (
                        <span className="block text-xs text-muted-foreground">
                          Efectivo: {efectivo ? ETIQUETA_NIVEL[efectivo].toLowerCase() : "sin acceso"}
                        </span>
                      )}
                      {heredado && (
                        <span className="block text-xs text-marino-suave">
                          Además por «{heredado.grupo}»: {ETIQUETA_NIVEL[heredado.nivel].toLowerCase()}
                        </span>
                      )}
                    </div>
                    <div
                      role="radiogroup"
                      aria-label={`Nivel en ${a.nombre}`}
                      className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-0.5"
                    >
                      {OPCIONES.map((op) => {
                        const activo = nivel === op.valor;
                        return (
                          <button
                            key={op.etiqueta}
                            type="button"
                            role="radio"
                            aria-checked={activo}
                            disabled={ocupado || usuario.rol === "admin"}
                            title={op.ayuda}
                            onClick={() => !activo && cambiar(a.id, op.valor)}
                            className={cn(
                              "rounded-md px-2.5 py-1 text-xs transition-colors disabled:opacity-60",
                              activo ? "bg-background font-medium shadow-xs" : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {op.etiqueta}
                          </button>
                        );
                      })}
                      {ocupado && <Loader2 className="ml-1 size-3.5 animate-spin self-center text-muted-foreground" />}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
