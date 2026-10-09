"use client";

// «Team leaders con cuenta», en la pantalla Estructura: cada team leader de
// la estructura con sus asesores activos y la cuenta de la app enlazada a
// ese nombre. Enlazar da a esa cuenta acceso a auditar a su equipo (crear,
// completar y publicar auditorías de sus asesores), por eso solo lo cambia
// un administrador; los demás lo ven en solo lectura. RLS lo vuelve a
// exigir en calidad_team_leaders (migración 035).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { enlazarTeamLeader } from "@/app/acciones/calidad";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Centinela: Radix Select no admite una opción con value vacío. */
const SIN_CUENTA = "sin-cuenta";

export type FilaTeamLeader = {
  /** Tal cual en calidad_asesores.team_leader. */
  nombre: string;
  asesoresActivos: number;
  /** false si el enlace quedó de un nombre que ya no aparece en la estructura. */
  enEstructura: boolean;
  /** Cuenta enlazada, o null si el team leader no tiene cuenta. */
  usuarioId: string | null;
};

type Perfil = { id: string; nombre: string };

/**
 * La sección completa: una fila por team leader. Con `esAdmin` cada fila
 * trae el selector de cuenta y el botón para quitar el enlace; sin él, solo
 * se muestra la cuenta enlazada. `perfiles` son los perfiles activos.
 */
export function TeamLeadersCuenta({ filas, perfiles, esAdmin }: { filas: FilaTeamLeader[]; perfiles: Perfil[]; esAdmin: boolean }) {
  const nombrePerfil = new Map(perfiles.map((p) => [p.id, p.nombre]));
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xs font-semibold tracking-[0.12em] text-atenuado uppercase">Team leaders con cuenta</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {esAdmin
            ? "Enlazar la cuenta da acceso a auditar a ese equipo: crear, completar y publicar auditorías de sus asesores."
            : "Lo enlaza un administrador: da acceso a auditar a ese equipo."}
        </p>
      </div>
      {filas.length === 0 ? (
        <p className="rounded-[20px] border bg-card px-5 py-4 text-sm text-muted-foreground">Ningún asesor tiene team leader asignado todavía.</p>
      ) : (
        <div className="overflow-x-auto rounded-[20px] border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team leader</TableHead>
                <TableHead className="text-right">Asesores activos</TableHead>
                <TableHead>Cuenta en la app</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.nombre}>
                  <TableCell className="font-medium">
                    {f.nombre}
                    {!f.enEstructura && <span className="ml-2 text-xs font-normal text-muted-foreground">Ya no aparece en la estructura</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{f.asesoresActivos}</TableCell>
                  <TableCell>
                    {esAdmin ? (
                      <SelectorCuenta fila={f} perfiles={perfiles} />
                    ) : f.usuarioId ? (
                      <Badge variant="secondary">{nombrePerfil.get(f.usuarioId) ?? "Cuenta desactivada"}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin cuenta · no audita</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

/** Selector de cuenta de un team leader (solo administradores): guarda al elegir. */
function SelectorCuenta({ fila, perfiles }: { fila: FilaTeamLeader; perfiles: Perfil[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [valor, setValor] = useState(fila.usuarioId ?? SIN_CUENTA);
  // Una cuenta enlazada que ya no está activa no viene entre los perfiles: se muestra igual.
  const cuentaInactiva = fila.usuarioId && !perfiles.some((p) => p.id === fila.usuarioId) ? fila.usuarioId : null;

  function guardar(nuevo: string) {
    if (nuevo === valor) return;
    const anterior = valor;
    const usuarioId = nuevo === SIN_CUENTA ? null : nuevo;
    setValor(nuevo);
    iniciar(async () => {
      const r = await enlazarTeamLeader(fila.nombre, usuarioId);
      if (!r.ok) {
        toast.error(r.error);
        setValor(anterior);
        return;
      }
      toast.success(usuarioId ? `${fila.nombre} ya puede auditar a su equipo` : `Se quitó la cuenta de ${fila.nombre}: ya no audita a su equipo`);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Select value={valor} onValueChange={guardar} disabled={pendiente}>
        <SelectTrigger className="w-64" aria-label={`Cuenta de ${fila.nombre}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SIN_CUENTA}>Sin cuenta</SelectItem>
          {cuentaInactiva && <SelectItem value={cuentaInactiva}>Cuenta desactivada · no audita</SelectItem>}
          {perfiles.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pendiente ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
      ) : (
        valor !== SIN_CUENTA && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => guardar(SIN_CUENTA)}
            aria-label={`Quitar el enlace de ${fila.nombre}`}
            title="Quitar el enlace"
          >
            <Unlink />
          </Button>
        )
      )}
    </span>
  );
}
