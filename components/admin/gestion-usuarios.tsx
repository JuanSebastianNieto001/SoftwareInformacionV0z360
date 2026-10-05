"use client";

// Panel de usuarios: lista con filtros (nombre o correo, grupo, rol, estado,
// nivel sobre un área), alta, cambio de rol, activación, contraseña temporal y
// gestión del buzón.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, Search, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import type { AreaBreve, GrupoBreve, UsuarioAdmin } from "@/app/api/admin/usuarios/route";
import { EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { iniciales } from "@/lib/formato";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatearFechaHora } from "@/lib/formato";
import { DESCRIPCION_ROL, ETIQUETA_NIVEL, ETIQUETA_ROL, nivelEfectivo } from "@/lib/permisos";
import { llamarApi } from "@/lib/subida-cliente";
import type { NivelAcceso, RolGlobal } from "@/lib/supabase/tipos";
import { NIVELES, ROLES } from "@/lib/validaciones";
import { cn } from "@/lib/utils";

const ESTILO_ROL: Record<string, string> = {
  admin: "border-transparent bg-marino text-white",
  editor: "border-transparent bg-tinte text-marino-suave",
  lector: "border-transparent bg-background text-nav-inactivo",
};

function contrasenaAleatoria(longitud = 12): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(longitud);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

type Modo =
  | { tipo: "cerrado" }
  | { tipo: "crear" }
  | { tipo: "editar"; usuario: UsuarioAdmin }
  | { tipo: "contrasena"; usuario: UsuarioAdmin };

export function GestionUsuarios({ miId }: { miId: string }) {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null);
  const [areas, setAreas] = useState<AreaBreve[]>([]);
  const [grupos, setGrupos] = useState<GrupoBreve[]>([]);
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroRol, setFiltroRol] = useState<RolGlobal | "">("");
  const [filtroEstado, setFiltroEstado] = useState<"" | "activos" | "inactivos" | "pendientes" | "buzon">("");
  const [filtroArea, setFiltroArea] = useState("");
  const [filtroNivel, setFiltroNivel] = useState<NivelAcceso | "" | "sin">("");
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>({ tipo: "cerrado" });
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  const cargar = useCallback(
    () =>
      llamarApi<{ usuarios: UsuarioAdmin[]; areas: AreaBreve[]; grupos: GrupoBreve[] }>("/api/admin/usuarios", { method: "GET" })
        .then((r) => {
          setUsuarios(r.usuarios);
          setAreas(r.areas);
          setGrupos(r.grupos);
          setError(null);
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "No se pudo cargar la lista.");
          setUsuarios([]);
        }),
    [],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function cambiarActivo(u: UsuarioAdmin, activo: boolean) {
    setOcupadoId(u.id);
    try {
      await llamarApi("/api/admin/usuarios", { method: "PATCH", body: JSON.stringify({ id: u.id, activo }) });
      toast.success(activo ? "Usuario activado" : "Usuario desactivado");
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setOcupadoId(null);
    }
  }

  /**
   * El filtrado es en memoria y no en el servidor a propósito: la lista
   * completa ya viaja en una sola llamada y cabe de sobra, así que filtrar
   * aquí responde al instante y no gasta una petición por tecla.
   */
  const filtrados = useMemo(() => {
    if (!usuarios) return [];
    const q = busqueda.trim().toLowerCase();
    return usuarios.filter((u) => {
      if (
        q &&
        !(u.nombre + " " + u.email + " " + (u.cargo ?? "")).toLowerCase().includes(q)
      ) {
        return false;
      }
      if (filtroRol && u.rol !== filtroRol) return false;
      if (filtroGrupo && !u.grupos.includes(filtroGrupo)) return false;
      if (filtroEstado === "activos" && !u.activo) return false;
      if (filtroEstado === "inactivos" && u.activo) return false;
      if (filtroEstado === "pendientes" && !u.debe_cambiar_contrasena) return false;
      if (filtroEstado === "buzon" && !(u.gestiona_buzon || u.rol === "admin")) return false;

      if (filtroArea) {
        // Se compara el nivel efectivo, no el guardado: es lo que la persona
        // puede hacer de verdad. Filtrar por lo guardado devolvería lectores
        // marcados con Editar que en la práctica no editan nada.
        const guardado = u.permisos.find((p) => p.area_id === filtroArea)?.nivel ?? null;
        const efectivo = nivelEfectivo(u.rol, u.activo, guardado);
        if (filtroNivel === "sin") return efectivo === null;
        if (filtroNivel && efectivo !== filtroNivel) return false;
        if (!filtroNivel && efectivo === null) return false;
      }
      return true;
    });
  }, [usuarios, busqueda, filtroRol, filtroGrupo, filtroEstado, filtroArea, filtroNivel]);

  const hayFiltros = Boolean(busqueda || filtroRol || filtroGrupo || filtroEstado || filtroArea);
  const limpiar = () => {
    setBusqueda("");
    setFiltroRol("");
    setFiltroGrupo("");
    setFiltroEstado("");
    setFiltroArea("");
    setFiltroNivel("");
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {!usuarios
            ? "Cargando…"
            : hayFiltros
              ? `${filtrados.length} de ${usuarios.length}`
              : `${usuarios.length} ${usuarios.length === 1 ? "usuario" : "usuarios"}`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" aria-label="Recargar" onClick={() => void cargar()}>
            <RefreshCw />
          </Button>
          <Button onClick={() => setModo({ tipo: "crear" })}>
            <Plus /> Nuevo usuario
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-atenuado" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, correo o cargo"
            className="pl-[42px]"
            aria-label="Buscar persona"
          />
        </div>

        {/* El segmento primero: es por donde se busca cuando hay 57 cuentas. */}
        <select
          value={filtroGrupo}
          onChange={(e) => setFiltroGrupo(e.target.value)}
          aria-label="Filtrar por grupo"
          className="h-10 min-w-0 rounded-lg border-[1.5px] border-input bg-campo px-2.5 text-[13px] outline-none transition-colors focus-visible:border-primary focus-visible:bg-card"
        >
          <option value="">Todos los grupos</option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nombre}
            </option>
          ))}
        </select>

        <select
          value={filtroRol}
          onChange={(e) => setFiltroRol(e.target.value as RolGlobal | "")}
          aria-label="Filtrar por rol"
          className="h-10 min-w-0 rounded-lg border-[1.5px] border-input bg-campo px-2.5 text-[13px] outline-none transition-colors focus-visible:border-primary focus-visible:bg-card"
        >
          <option value="">Todos los roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ETIQUETA_ROL[r]}
            </option>
          ))}
        </select>

        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}
          aria-label="Filtrar por estado"
          className="h-10 min-w-0 rounded-lg border-[1.5px] border-input bg-campo px-2.5 text-[13px] outline-none transition-colors focus-visible:border-primary focus-visible:bg-card"
        >
          <option value="">Cualquier estado</option>
          <option value="activos">Solo activos</option>
          <option value="inactivos">Solo desactivados</option>
          <option value="pendientes">Con clave pendiente</option>
          <option value="buzon">Gestionan el buzón</option>
        </select>

        <select
          value={filtroArea}
          onChange={(e) => {
            setFiltroArea(e.target.value);
            if (!e.target.value) setFiltroNivel("");
          }}
          aria-label="Filtrar por área"
          className="h-10 min-w-0 rounded-lg border-[1.5px] border-input bg-campo px-2.5 text-[13px] outline-none transition-colors focus-visible:border-primary focus-visible:bg-card"
        >
          <option value="">Cualquier área</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>

        {/* El nivel solo significa algo con un área elegida; sin ella no aparece. */}
        {filtroArea && (
          <select
            value={filtroNivel}
            onChange={(e) => setFiltroNivel(e.target.value as NivelAcceso | "" | "sin")}
            aria-label="Filtrar por nivel en el área"
            className="h-10 min-w-0 rounded-lg border-[1.5px] border-input bg-campo px-2.5 text-[13px] outline-none transition-colors focus-visible:border-primary focus-visible:bg-card"
          >
            <option value="">Con cualquier acceso</option>
            {NIVELES.map((n) => (
              <option key={n} value={n}>
                {ETIQUETA_NIVEL[n]}
              </option>
            ))}
            <option value="sin">Sin acceso</option>
          </select>
        )}

        {hayFiltros && (
          <Button type="button" variant="ghost" onClick={limpiar}>
            Limpiar
          </Button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {usuarios === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : usuarios.length === 0 ? (
        <EstadoVacio titulo="No hay usuarios" descripcion="Crea el primero con el botón de arriba." />
      ) : filtrados.length === 0 ? (
        <EstadoVacio
          titulo="Ninguna persona coincide"
          descripcion="Prueba con otros filtros o límpialos para ver la lista completa."
          accion={
            <Button variant="outline" onClick={limpiar}>
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[20px] border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="hidden md:table-cell">Cargo</TableHead>
                <TableHead className="hidden sm:table-cell">Último acceso</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((u) => (
                <TableRow key={u.id} className={cn(!u.activo && "opacity-55")}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tinte text-[12px] font-semibold text-marino-suave">
                        {iniciales(u.nombre || u.email) || "U"}
                      </span>
                      <div className="min-w-0">
                        <span className="block font-medium">
                          {u.nombre || "(sin nombre)"}
                          {u.id === miId && (
                            <span className="ml-1 text-xs text-muted-foreground">(tú)</span>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">{u.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={ESTILO_ROL[u.rol]}>{ETIQUETA_ROL[u.rol]}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{u.cargo ?? "—"}</TableCell>
                  <TableCell className="hidden whitespace-nowrap sm:table-cell">
                    {u.ultimo_login ? formatearFechaHora(u.ultimo_login) : "Nunca"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.activo ? (
                        <Badge className="border-transparent bg-[#dcfce7] text-[#166534]">Activo</Badge>
                      ) : (
                        <Badge className="border-transparent bg-[#fee2e2] text-[#991b1b]">
                          Desactivado
                        </Badge>
                      )}
                      {u.debe_cambiar_contrasena && (
                        <Badge className="border-transparent bg-[#fef3c7] text-[#92400e]">
                          Clave pendiente
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Acciones para ${u.nombre}`} disabled={ocupadoId === u.id}>
                          {ocupadoId === u.id ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setModo({ tipo: "editar", usuario: u })}>
                          <Pencil /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setModo({ tipo: "contrasena", usuario: u })}>
                          <KeyRound /> Restablecer contraseña
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/permisos?usuario=${u.id}`}>
                            <UserCheck /> Ver permisos
                          </Link>
                        </DropdownMenuItem>
                        {u.id !== miId && (
                          <>
                            <DropdownMenuSeparator />
                            {u.activo ? (
                              <DropdownMenuItem variant="destructive" onSelect={() => void cambiarActivo(u, false)}>
                                <UserX /> Desactivar
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => void cambiarActivo(u, true)}>
                                <UserCheck /> Activar
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* La key remonta el diálogo en cada apertura: el estado del formulario
          se inicializa desde `modo` sin necesidad de efectos. */}
      <DialogoUsuario
        key={modo.tipo === "cerrado" ? "cerrado" : `${modo.tipo}-${"usuario" in modo ? modo.usuario.id : "nuevo"}`}
        modo={modo}
        miId={miId}
        onCerrar={() => setModo({ tipo: "cerrado" })}
        onGuardado={() => void cargar()}
      />
    </>
  );
}

function DialogoUsuario({
  modo,
  miId,
  onCerrar,
  onGuardado,
}: {
  modo: Modo;
  miId: string;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const abierto = modo.tipo !== "cerrado";
  const usuario = modo.tipo === "editar" || modo.tipo === "contrasena" ? modo.usuario : null;

  // Estado inicial derivado de `modo`; el componente se remonta (key) en cada apertura.
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState(() => (modo.tipo === "editar" ? modo.usuario.nombre : ""));
  const [cargo, setCargo] = useState(() => (modo.tipo === "editar" ? modo.usuario.cargo ?? "" : ""));
  const [rol, setRol] = useState<RolGlobal>(() => (modo.tipo === "editar" ? modo.usuario.rol : "lector"));
  const [password, setPassword] = useState(() =>
    modo.tipo === "crear" || modo.tipo === "contrasena" ? contrasenaAleatoria() : "",
  );
  // Marcada por defecto: dar una contraseña y no pedir que la cambien es la
  // excepción, no la norma. Si se desmarca, el esquema exige ocho caracteres.
  const [exigirCambio, setExigirCambio] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const [creado, setCreado] = useState<{ email: string; password: string } | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPendiente(true);
    try {
      if (modo.tipo === "crear") {
        await llamarApi("/api/admin/usuarios", {
          method: "POST",
          body: JSON.stringify({ email, password, nombre, cargo: cargo || undefined, rol, exigir_cambio: exigirCambio }),
        });
        setCreado({ email: email.trim().toLowerCase(), password });
        toast.success("Usuario creado");
        onGuardado();
      } else if (modo.tipo === "editar") {
        await llamarApi("/api/admin/usuarios", {
          method: "PATCH",
          body: JSON.stringify({ id: modo.usuario.id, nombre, cargo: cargo || null, rol }),
        });
        toast.success("Usuario actualizado");
        onGuardado();
        onCerrar();
      } else if (modo.tipo === "contrasena") {
        await llamarApi("/api/admin/usuarios", {
          method: "PATCH",
          body: JSON.stringify({ id: modo.usuario.id, nueva_contrasena: password, exigir_cambio: exigirCambio }),
        });
        setCreado({ email: modo.usuario.email, password });
        toast.success("Contraseña restablecida");
        onGuardado();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setPendiente(false);
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Copiado");
    } catch {
      toast.error("No se pudo copiar; selecciónalo manualmente.");
    }
  }

  const titulo =
    modo.tipo === "crear" ? "Nuevo usuario" : modo.tipo === "editar" ? "Editar usuario" : "Restablecer contraseña";

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent>
        {creado ? (
          <>
            <DialogHeader>
              <DialogTitle>Credenciales temporales</DialogTitle>
              <DialogDescription>
                Compártelas por un canal seguro. Es la única vez que se muestran; al entrar, la persona deberá
                elegir su propia contraseña.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <CampoCopiable etiqueta="Correo" valor={creado.email} onCopiar={copiar} />
              <CampoCopiable etiqueta="Contraseña temporal" valor={creado.password} onCopiar={copiar} mono />
            </div>
            <DialogFooter>
              <Button onClick={onCerrar}>Listo</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={enviar} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{titulo}</DialogTitle>
              {usuario && <DialogDescription>{usuario.email}</DialogDescription>}
              {modo.tipo === "crear" && (
                <DialogDescription>Se creará con la contraseña temporal indicada y deberá cambiarla al entrar.</DialogDescription>
              )}
            </DialogHeader>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {modo.tipo === "crear" && (
              <div className="space-y-1.5">
                <Label htmlFor="u-email">Correo</Label>
                <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus disabled={pendiente} />
              </div>
            )}

            {(modo.tipo === "crear" || modo.tipo === "editar") && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="u-nombre">Nombre</Label>
                  <Input id="u-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required disabled={pendiente} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="u-cargo">Cargo (opcional)</Label>
                  <Input id="u-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} disabled={pendiente} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="u-rol">Rol</Label>
                  <select
                    id="u-rol"
                    value={rol}
                    onChange={(e) => setRol(e.target.value as RolGlobal)}
                    disabled={pendiente || (modo.tipo === "editar" && modo.usuario.id === miId)}
                    className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ETIQUETA_ROL[r]}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">{DESCRIPCION_ROL[rol]}</p>
                </div>
              </>
            )}

            {(modo.tipo === "crear" || modo.tipo === "contrasena") && (
              <div className="space-y-1.5">
                <Label htmlFor="u-pass">Contraseña temporal</Label>
                <div className="flex gap-2">
                  <Input
                    id="u-pass"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={exigirCambio ? 6 : 8}
                    required
                    className="font-mono"
                    disabled={pendiente}
                  />
                  <Button type="button" variant="outline" size="icon" aria-label="Generar otra" onClick={() => setPassword(contrasenaAleatoria())} disabled={pendiente}>
                    <RefreshCw />
                  </Button>
                </div>
                <div className="flex items-start gap-2 pt-1">
                  <Checkbox
                    id="u-exigir"
                    className="size-[18px] rounded-[6px] border-borde-acento"
                    checked={exigirCambio}
                    onCheckedChange={(v) => setExigirCambio(v === true)}
                    disabled={pendiente}
                  />
                  <Label htmlFor="u-exigir" className="text-sm leading-tight font-normal">
                    Obligar a cambiarla la próxima vez que entre
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {exigirCambio
                        ? "Esta contraseña es temporal: al entrar tendrá que elegir una suya."
                        : "La contraseña quedará fija, así que debe tener al menos 8 caracteres."}
                    </span>
                  </Label>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onCerrar} disabled={pendiente}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Loader2 className="animate-spin" />}
                {modo.tipo === "crear" ? "Crear usuario" : modo.tipo === "editar" ? "Guardar" : "Restablecer"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CampoCopiable({
  etiqueta,
  valor,
  onCopiar,
  mono = false,
}: {
  etiqueta: string;
  valor: string;
  onCopiar: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{etiqueta}</span>
      <div className="flex gap-2">
        <Input readOnly value={valor} className={cn(mono && "font-mono")} onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="outline" size="icon" aria-label={`Copiar ${etiqueta}`} onClick={() => onCopiar(valor)}>
          <Copy />
        </Button>
      </div>
    </div>
  );
}
