import "server-only";

// Las opciones del buscador de colaborador del módulo de feedback, acotadas
// al ALCANCE del emisor (tabla feedback_alcance): la dirección y los
// administradores ven a todo el mundo; un team leader o back office solo a
// los asesores; Clemencia solo a Selección, etcétera. La base vuelve a
// comprobar el alcance al registrar, así que esto es solo comodidad de
// pantalla. Los perfiles cuyo nombre ya está en la estructura no se repiten.
import type { ColaboradorOpcion } from "@/components/feedback/selector-colaborador";
import type { ClienteServidor } from "../supabase/server";

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export type ColaboradoresDelEmisor = {
  opciones: ColaboradorOpcion[];
  /** Puede emitir a cualquiera (dirección o administrador): habilita el tipo de liderazgo. */
  emiteTodos: boolean;
};

export async function cargarColaboradores(
  supabase: ClienteServidor,
  emisor: { userId: string; esAdmin: boolean },
): Promise<ColaboradoresDelEmisor> {
  const [{ data: asesores }, { data: perfiles }, { data: alcance }] = await Promise.all([
    supabase.from("calidad_asesores").select("nombre, team_leader, usuario_id").eq("activo", true),
    supabase.from("perfiles").select("id, nombre, cargo").eq("activo", true),
    supabase.from("feedback_alcance").select("destino_tipo, destino_usuario_id, destino_cargo").eq("emisor_id", emisor.userId),
  ]);

  const reglas = alcance ?? [];
  const emiteTodos = emisor.esAdmin || reglas.some((r) => r.destino_tipo === "todos");
  const aAsesores = emiteTodos || reglas.some((r) => r.destino_tipo === "asesores");
  const usuariosPermitidos = new Set(reglas.filter((r) => r.destino_tipo === "usuario").map((r) => r.destino_usuario_id));
  const cargosPermitidos = new Set(
    reglas.filter((r) => r.destino_tipo === "cargo").map((r) => normalizar(r.destino_cargo ?? "")),
  );

  const opciones: ColaboradorOpcion[] = [];
  const yaEstan = new Set<string>();

  if (aAsesores) {
    for (const a of asesores ?? []) {
      opciones.push({ nombre: a.nombre, team_leader: a.team_leader, cargo: null, con_cuenta: a.usuario_id !== null, usuario_id: a.usuario_id });
      yaEstan.add(normalizar(a.nombre));
    }
  }

  // Los nombres de la estructura se excluyen de perfiles aunque el emisor no
  // emita a asesores: un perfil poliedro duplicado no debe colarse por aquí.
  for (const a of asesores ?? []) yaEstan.add(normalizar(a.nombre));

  for (const p of perfiles ?? []) {
    if (!p.nombre || yaEstan.has(normalizar(p.nombre))) continue;
    const permitido = emiteTodos || usuariosPermitidos.has(p.id) || (p.cargo !== null && cargosPermitidos.has(normalizar(p.cargo)));
    if (!permitido) continue;
    yaEstan.add(normalizar(p.nombre));
    opciones.push({ nombre: p.nombre, team_leader: null, cargo: p.cargo ?? "Administración", con_cuenta: true, usuario_id: p.id });
  }

  return { opciones: opciones.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), emiteTodos };
}
