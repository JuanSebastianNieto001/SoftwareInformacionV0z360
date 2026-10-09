import "server-only";

/*
 * Capa de lectura del módulo de Cumpleaños (lo que en Laravel serían los
 * «modelos»): aquí viven las consultas de solo lectura que hace la página de
 * /cumpleanos. Las escrituras siguen en app/acciones/cumpleanos.ts.
 *
 * Cada función recibe el cliente de Supabase de la sesión
 * (crearClienteServidor), así que la consulta viaja con la identidad de
 * quien navega y es RLS quien decide qué filas vuelven. Aquí no hay chequeos
 * de permisos en TypeScript: el guardia del módulo (exigirModulo) está en el
 * layout y en la página.
 */
import type { ClienteServidor } from "@/lib/supabase/server";

/**
 * Todos los cumpleaños, activos e inactivos (vista v_cumpleanos, todas las
 * columnas: el registro, el próximo cumpleaños, los días que faltan, la edad
 * que cumple y el nombre de la cuenta vinculada), del más cercano al más
 * lejano. Máximo 1000 filas. Los filtros de pantalla los aplica la página.
 *
 * Devuelve también el `error` de la consulta para que la página lo muestre.
 *
 * Acceso (RLS cumpleanos_select, migración 014): filas de un área en la que
 * la persona tiene algún nivel; la vista es security_invoker.
 */
export async function listarCumpleanos(supabase: ClienteServidor) {
  const { data, error } = await supabase.from("v_cumpleanos").select("*").order("dias_faltan").limit(1000);
  return { cumpleanos: data ?? [], error };
}

/**
 * Perfiles activos (id y nombre), por nombre: las cuentas de la app con las
 * que se puede vincular un cumpleaños.
 *
 * Acceso (RLS perfiles_select): cualquier usuario autenticado ve todos los
 * perfiles. La página solo lo pide a quien puede editar el cuadro.
 */
export async function listarPerfilesVinculables(supabase: ClienteServidor) {
  const { data } = await supabase.from("perfiles").select("id, nombre").eq("activo", true).order("nombre");
  return data ?? [];
}
