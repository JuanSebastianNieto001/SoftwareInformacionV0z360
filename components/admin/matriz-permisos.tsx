"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { asignarPermiso } from "@/app/(admin)/admin/acciones";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ETIQUETA_ROL, nivelEfectivo } from "@/lib/permisos";
import type { NivelAcceso, RolGlobal } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

type Usuario = { id: string; nombre: string; cargo: string | null; rol: RolGlobal; activo: boolean };
type Area = { id: string; nombre: string; activa: boolean };
type Permiso = { usuario_id: string; area_id: string; nivel: NivelAcceso };

const OPCIONES: { valor: NivelAcceso | null; etiqueta: string }[] = [
  { valor: null, etiqueta: "Sin acceso" },
  { valor: "lectura", etiqueta: "Lectura" },
  { valor: "edicion", etiqueta: "Edición" },
];

export function MatrizPermisos({
  usuarios,
  areas,
  permisos,
  usuarioInicial,
}: {
  usuarios: Usuario[];
  areas: Area[];
  permisos: Permiso[];
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

  const cuentaPermisos = (u: Usuario) =>
    areas.filter((a) => nivelDe(u.id, a.id) !== null).length;

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
                  Como es lector, «Edición» se aplicará como lectura mientras no cambie su rol.
                </p>
              )}
            </header>
            <ul className="divide-y">
              {areas.map((a) => {
                const nivel = nivelDe(usuario.id, a.id);
                const efectivo = nivelEfectivo(usuario.rol, usuario.activo, nivel);
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
                          Efectivo: {efectivo === "lectura" ? "lectura" : efectivo === "edicion" ? "edición" : "sin acceso"}
                        </span>
                      )}
                    </div>
                    <div
                      role="radiogroup"
                      aria-label={`Nivel en ${a.nombre}`}
                      className="inline-flex rounded-lg border bg-muted/40 p-0.5"
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
