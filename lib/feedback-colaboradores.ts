import "server-only";

// Las opciones del buscador de colaborador del módulo de feedback: la
// estructura operativa (asesores de calidad, con su team leader) MÁS las
// cuentas administrativas de la aplicación (team leaders, back office,
// gerencias…), identificadas por su cargo. Los perfiles cuyo nombre ya está
// en la estructura no se repiten. RLS deja leer perfiles (solo nombre y
// cargo se usan aquí) a cualquier autenticado.
import type { ColaboradorOpcion } from "@/components/feedback/selector-colaborador";
import type { ClienteServidor } from "./supabase/server";

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export async function cargarColaboradores(supabase: ClienteServidor): Promise<ColaboradorOpcion[]> {
  const [{ data: asesores }, { data: perfiles }] = await Promise.all([
    supabase.from("calidad_asesores").select("nombre, team_leader, usuario_id").eq("activo", true),
    supabase.from("perfiles").select("id, nombre, cargo").eq("activo", true),
  ]);

  const opciones: ColaboradorOpcion[] = (asesores ?? []).map((a) => ({
    nombre: a.nombre,
    team_leader: a.team_leader,
    cargo: null,
    con_cuenta: a.usuario_id !== null,
    usuario_id: a.usuario_id,
  }));

  const yaEstan = new Set(opciones.map((o) => normalizar(o.nombre)));
  for (const p of perfiles ?? []) {
    if (!p.nombre || yaEstan.has(normalizar(p.nombre))) continue;
    yaEstan.add(normalizar(p.nombre));
    opciones.push({ nombre: p.nombre, team_leader: null, cargo: p.cargo ?? "Administración", con_cuenta: true, usuario_id: p.id });
  }

  return opciones.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
