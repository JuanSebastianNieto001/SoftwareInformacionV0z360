"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Loader2, Plus, Search, Users2 } from "lucide-react";
import { toast } from "sonner";
import {
  actualizarGrupo,
  asignarMiembro,
  asignarPermisoGrupo,
  crearGrupo,
} from "@/app/(admin)/admin/acciones";
import { EstadoVacio } from "@/components/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ETIQUETA_ROL } from "@/lib/permisos";
import type { NivelAcceso, RolGlobal } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

export type GrupoAdmin = {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
};
type Area = { id: string; nombre: string; activa: boolean };
type Persona = { id: string; nombre: string; cargo: string | null; rol: RolGlobal; activo: boolean };

/**
 * Los mismos cinco peldaños que en Permisos por persona. Se repiten aquí a
 * propósito en lugar de importarse: lo que un grupo concede y lo que se
 * concede a alguien en particular son la misma escalera, y verla escrita
 * igual en las dos pantallas es lo que hace entender que se suman.
 */
const OPCIONES: { valor: NivelAcceso | null; etiqueta: string }[] = [
  { valor: null, etiqueta: "Nada" },
  { valor: "lectura", etiqueta: "Solo leer" },
  { valor: "descarga", etiqueta: "Descargar" },
  { valor: "edicion", etiqueta: "Editar" },
  { valor: "total", etiqueta: "Todos" },
];

export function GestionGrupos({
  grupos,
  areas,
  personas,
  miembros,
  permisos,
}: {
  grupos: GrupoAdmin[];
  areas: Area[];
  personas: Persona[];
  miembros: { grupo_id: string; usuario_id: string }[];
  permisos: { grupo_id: string; area_id: string; nivel: NivelAcceso }[];
}) {
  const [seleccionado, setSeleccionado] = useState<string | null>(grupos[0]?.id ?? null);
  const [busqueda, setBusqueda] = useState("");
  const [soloMiembros, setSoloMiembros] = useState(false);
  const [creando, setCreando] = useState(false);
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const [, iniciar] = useTransition();

  // Estado local optimista: la pantalla responde al instante y se corrige
  // sola si el servidor rechaza el cambio.
  const [pertenece, setPertenece] = useState<Map<string, boolean>>(new Map());
  const [nivelesLocales, setNivelesLocales] = useState<Map<string, NivelAcceso | null>>(new Map());

  const grupo = grupos.find((g) => g.id === seleccionado) ?? null;

  const esMiembro = (grupoId: string, personaId: string) => {
    const clave = `${grupoId}|${personaId}`;
    if (pertenece.has(clave)) return pertenece.get(clave)!;
    return miembros.some((m) => m.grupo_id === grupoId && m.usuario_id === personaId);
  };

  const nivelDe = (grupoId: string, areaId: string): NivelAcceso | null => {
    const clave = `${grupoId}|${areaId}`;
    if (nivelesLocales.has(clave)) return nivelesLocales.get(clave) ?? null;
    return permisos.find((p) => p.grupo_id === grupoId && p.area_id === areaId)?.nivel ?? null;
  };

  const cuenta = (grupoId: string) => personas.filter((p) => esMiembro(grupoId, p.id)).length;

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return personas.filter((p) => {
      if (q && !(p.nombre + " " + (p.cargo ?? "")).toLowerCase().includes(q)) return false;
      if (soloMiembros && grupo && !esMiembro(grupo.id, p.id)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas, busqueda, soloMiembros, grupo, pertenece, miembros]);

  function marcarOcupado(clave: string, ocupado: boolean) {
    setOcupados((s) => {
      const n = new Set(s);
      if (ocupado) n.add(clave);
      else n.delete(clave);
      return n;
    });
  }

  function alternarMiembro(personaId: string) {
    if (!grupo) return;
    const clave = `${grupo.id}|${personaId}`;
    const dentro = !esMiembro(grupo.id, personaId);
    setPertenece((m) => new Map(m).set(clave, dentro));
    marcarOcupado(clave, true);
    iniciar(async () => {
      const r = await asignarMiembro({ grupo_id: grupo.id, usuario_id: personaId, dentro });
      marcarOcupado(clave, false);
      if (!r.ok) {
        setPertenece((m) => new Map(m).set(clave, !dentro));
        toast.error(r.error);
      }
    });
  }

  function cambiarNivel(areaId: string, nivel: NivelAcceso | null) {
    if (!grupo) return;
    const clave = `${grupo.id}|${areaId}`;
    const anterior = nivelDe(grupo.id, areaId);
    setNivelesLocales((m) => new Map(m).set(clave, nivel));
    marcarOcupado(clave, true);
    iniciar(async () => {
      const r = await asignarPermisoGrupo({ grupo_id: grupo.id, area_id: areaId, nivel });
      marcarOcupado(clave, false);
      if (!r.ok) {
        setNivelesLocales((m) => new Map(m).set(clave, anterior));
        toast.error(r.error);
      }
    });
  }

  if (grupos.length === 0) {
    return (
      <>
        <EstadoVacio
          icono={<Users2 />}
          titulo="Todavía no hay grupos"
          descripcion="Un grupo reúne a quienes hacen el mismo trabajo para darles permisos de una vez."
          accion={<Button onClick={() => setCreando(true)}>Crear el primero</Button>}
        />
        <DialogoGrupo abierto={creando} onCerrar={() => setCreando(false)} />
      </>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      {/* Los grupos */}
      <aside className="rounded-[20px] border bg-card">
        <ul className="p-1.5">
          {grupos.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => setSeleccionado(g.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-tinte",
                  seleccionado === g.id && "bg-marino font-medium text-white hover:bg-marino",
                  !g.activo && "opacity-55",
                )}
              >
                <span className="min-w-0 truncate">{g.nombre}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums",
                    seleccionado === g.id ? "text-white/70" : "text-muted-foreground",
                  )}
                >
                  {cuenta(g.id)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t p-2">
          <Button variant="ghost" className="w-full justify-start" onClick={() => setCreando(true)}>
            <Plus /> Nuevo grupo
          </Button>
        </div>
      </aside>

      {grupo && (
        <section className="space-y-4">
          <header className="rounded-[20px] border bg-card p-[18px]">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{grupo.nombre}</h2>
              {!grupo.activo && <Badge variant="destructive">Desactivado</Badge>}
              <span className="text-sm text-muted-foreground">
                · {cuenta(grupo.id)} {cuenta(grupo.id) === 1 ? "persona" : "personas"}
              </span>
              <div className="ml-auto flex gap-2">
                <DialogoGrupo grupo={grupo} />
              </div>
            </div>
            {grupo.descripcion && (
              <p className="mt-1.5 text-sm text-muted-foreground">{grupo.descripcion}</p>
            )}
            {!grupo.activo && (
              <p className="mt-2 text-xs text-muted-foreground">
                Un grupo desactivado deja de conceder permisos, pero conserva sus miembros: al
                reactivarlo todo vuelve como estaba.
              </p>
            )}
          </header>

          {/* Lo que el grupo concede */}
          <div className="rounded-[20px] border bg-card">
            <div className="border-b px-[18px] py-3.5">
              <h3 className="font-medium">Lo que concede este grupo</h3>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Se suma a lo que cada persona tenga por su cuenta: siempre gana el mayor de los
                dos, así que entrar a un grupo nunca le quita nada a nadie.
              </p>
            </div>
            <ul className="divide-y">
              {areas.map((a) => {
                const nivel = nivelDe(grupo.id, a.id);
                const ocupado = ocupados.has(`${grupo.id}|${a.id}`);
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-[18px] py-3"
                  >
                    <span className={cn("text-sm", !a.activa && "text-muted-foreground line-through")}>
                      {a.nombre}
                    </span>
                    <div
                      role="radiogroup"
                      aria-label={`Nivel del grupo ${grupo.nombre} en ${a.nombre}`}
                      className="inline-flex flex-wrap rounded-lg border bg-campo p-0.5"
                    >
                      {OPCIONES.map((op) => {
                        const activo = nivel === op.valor;
                        return (
                          <button
                            key={op.etiqueta}
                            type="button"
                            role="radio"
                            aria-checked={activo}
                            disabled={ocupado}
                            onClick={() => !activo && cambiarNivel(a.id, op.valor)}
                            className={cn(
                              "rounded-md px-2.5 py-1 text-xs transition-colors disabled:opacity-60",
                              activo
                                ? "bg-card font-medium shadow-xs"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {op.etiqueta}
                          </button>
                        );
                      })}
                      {ocupado && (
                        <Loader2 className="ml-1 size-3.5 animate-spin self-center text-muted-foreground" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Quién está dentro */}
          <div className="rounded-[20px] border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b px-[18px] py-3">
              <h3 className="mr-auto font-medium">Quién está dentro</h3>
              <div className="relative min-w-0 flex-1 basis-48">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-atenuado" />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar persona"
                  className="h-10 pl-[42px]"
                  aria-label="Buscar persona"
                />
              </div>
              <Button
                type="button"
                variant={soloMiembros ? "secondary" : "ghost"}
                onClick={() => setSoloMiembros((v) => !v)}
              >
                {soloMiembros ? "Viendo solo miembros" : "Ver solo miembros"}
              </Button>
            </div>

            {filtradas.length === 0 ? (
              <p className="px-[18px] py-6 text-sm text-muted-foreground">Sin coincidencias.</p>
            ) : (
              <ul className="max-h-[420px] divide-y overflow-y-auto">
                {filtradas.map((p) => {
                  const dentro = esMiembro(grupo.id, p.id);
                  const ocupado = ocupados.has(`${grupo.id}|${p.id}`);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => alternarMiembro(p.id)}
                        disabled={ocupado}
                        className={cn(
                          "flex w-full items-center gap-3 px-[18px] py-2.5 text-left transition-colors hover:bg-zona disabled:opacity-60",
                          !p.activo && "opacity-55",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px] transition-colors",
                            dentro ? "border-primary bg-primary text-white" : "border-borde-acento",
                          )}
                          aria-hidden
                        >
                          {ocupado ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : dentro ? (
                            <Check className="size-3.5" />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{p.nombre || "(sin nombre)"}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {ETIQUETA_ROL[p.rol]}
                            {p.cargo ? ` · ${p.cargo}` : ""}
                          </span>
                        </span>
                        <span className="sr-only">{dentro ? "Quitar del grupo" : "Añadir al grupo"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}

      <DialogoGrupo abierto={creando} onCerrar={() => setCreando(false)} />
    </div>
  );
}

/** Crea un grupo (sin `grupo`) o edita el que se le pase. */
function DialogoGrupo({
  grupo,
  abierto,
  onCerrar,
}: {
  grupo?: GrupoAdmin;
  abierto?: boolean;
  onCerrar?: () => void;
}) {
  const [propio, setPropio] = useState(false);
  const visible = abierto ?? propio;
  const cerrar = onCerrar ?? (() => setPropio(false));

  const [nombre, setNombre] = useState(grupo?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(grupo?.descripcion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = grupo
        ? await actualizarGrupo({ id: grupo.id, nombre, descripcion })
        : await crearGrupo({ nombre, descripcion });
      if (!r.ok) return setError(r.error);
      toast.success(grupo ? "Grupo actualizado" : "Grupo creado");
      if (!grupo) {
        setNombre("");
        setDescripcion("");
      }
      cerrar();
    });
  }

  function alternarActivo() {
    if (!grupo) return;
    iniciar(async () => {
      const r = await actualizarGrupo({ id: grupo.id, activo: !grupo.activo });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(grupo.activo ? "Grupo desactivado" : "Grupo activado");
    });
  }

  return (
    <>
      {grupo && (
        <>
          <Button variant="outline" size="sm" onClick={() => setPropio(true)}>
            Editar
          </Button>
          <Button variant="ghost" size="sm" onClick={alternarActivo} disabled={pendiente}>
            {grupo.activo ? "Desactivar" : "Activar"}
          </Button>
        </>
      )}

      <Dialog open={visible} onOpenChange={(v) => !v && cerrar()}>
        <DialogContent>
          <form onSubmit={enviar} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{grupo ? "Editar grupo" : "Nuevo grupo"}</DialogTitle>
              <DialogDescription>
                Un grupo reúne a quienes hacen el mismo trabajo. Los permisos se le dan una vez y
                los hereda todo el que entre.
              </DialogDescription>
            </DialogHeader>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="space-y-1.5">
              <Label htmlFor="g-nombre">Nombre</Label>
              <Input
                id="g-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                maxLength={60}
                placeholder="Supervisores"
                disabled={pendiente}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="g-descripcion">Descripción (opcional)</Label>
              <Textarea
                id="g-descripcion"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder="Qué trabajo hace esta gente."
                disabled={pendiente}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={cerrar} disabled={pendiente}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Loader2 className="animate-spin" />}
                {grupo ? "Guardar" : "Crear grupo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
