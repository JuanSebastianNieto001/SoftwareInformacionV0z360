import "server-only";

/*
 * Capa de lectura del módulo de Feedback (retroalimentación operativa).
 *
 * Todas las funciones reciben el cliente de Supabase de la SESIÓN (el de
 * crearClienteServidor), nunca el de servicio: cada consulta pasa por RLS con
 * la identidad de quien navega, y es la base la que decide qué filas vuelven
 * (el alcance del emisor sobre lo que registró, ve_todo para quien ve el
 * panel completo, lo propio del colaborador en «Mis feedback», la bitácora
 * solo para administradores y quien puede eliminar). Aquí NO se comprueban
 * permisos en TypeScript: las guardias (exigirModulo, puedeEditar, etc.)
 * viven en las páginas y la autoridad final es siempre RLS.
 *
 * Las escrituras siguen en app/acciones; esto es solo lectura.
 */
import type { ClienteServidor } from "@/lib/supabase/server";
import type { FeedbackEstado } from "@/lib/supabase/tipos";
import { cargarColaboradores } from "./colaboradores";

/**
 * Indica si quien navega puede eliminar feedback (RPC feedback_puede_eliminar):
 * nivel Total EXPLÍCITO sobre el cuadro de Feedback, por permiso directo o de
 * grupo activo. No cuenta el rol de administrador: quien quiera sumarlo lo
 * combina en la página. Un error o una respuesta vacía cuentan como `false`.
 */
export async function puedeEliminarFeedback(supabase: ClienteServidor): Promise<boolean> {
  const { data } = await supabase.rpc("feedback_puede_eliminar");
  return data === true;
}

/**
 * Lista del panel de feedback (vista v_feedback, con el catálogo ya unido),
 * de la fecha del hecho más reciente a la más antigua, hasta 2000 filas.
 * Filtros opcionales por tipo del catálogo y por estado; vacíos no filtran.
 * Acceso (RLS de feedback): el colaborador ve lo suyo y, con el cuadro, el
 * emisor ve lo que registró o todo si tiene ve_todo (o es administrador).
 */
export async function listarFeedback(
  supabase: ClienteServidor,
  filtros: { tipo?: string; estado?: FeedbackEstado | "" } = {},
) {
  let consulta = supabase.from("v_feedback").select("*").order("fecha", { ascending: false }).limit(2000);
  if (filtros.tipo) consulta = consulta.eq("tipo", filtros.tipo);
  if (filtros.estado) consulta = consulta.eq("estado", filtros.estado);
  const { data } = await consulta;
  return data ?? [];
}

/**
 * Un feedback con su catálogo (vista v_feedback) para la ficha de detalle, o
 * `null` si no existe o RLS no lo entrega (mismo alcance que listarFeedback).
 * El id debe venir ya validado como uuid.
 */
export async function obtenerFeedbackDetalle(supabase: ClienteServidor, id: string) {
  const { data } = await supabase.from("v_feedback").select("*").eq("id", id).maybeSingle();
  return data;
}

/**
 * La fila cruda de la tabla feedback para precargar el formulario de edición,
 * o `null` si no existe o RLS no la entrega (el colaborador ve lo suyo; el
 * emisor con el cuadro, lo que registró o todo si tiene ve_todo). El id debe
 * venir ya validado como uuid.
 */
export async function obtenerFeedbackParaEditar(supabase: ClienteServidor, id: string) {
  const { data } = await supabase.from("feedback").select("*").eq("id", id).maybeSingle();
  return data;
}

/**
 * El catálogo ACTIVO de tipos, subtipos y detalles de feedback, en su orden.
 * Con `incluirSoloDireccion: false` se omiten los motivos reservados a la
 * dirección (tipo de liderazgo y equipo). Acceso: el catálogo lo lee
 * cualquier usuario autenticado; la base vuelve a exigir el alcance al
 * registrar.
 */
export async function listarCatalogoFeedback(
  supabase: ClienteServidor,
  { incluirSoloDireccion = true }: { incluirSoloDireccion?: boolean } = {},
) {
  let consulta = supabase.from("feedback_catalogo").select("*").eq("activo", true).order("orden");
  if (!incluirSoloDireccion) consulta = consulta.eq("solo_direccion", false);
  const { data } = await consulta;
  return data ?? [];
}

/**
 * Lo que necesita el formulario de feedback (nuevo o editar): las opciones del
 * buscador de colaborador acotadas al alcance del emisor (feedback_alcance) y
 * el catálogo activo, que solo incluye los motivos de dirección si el emisor
 * emite a todos (administrador o alcance «todos»). Va en serie porque el
 * catálogo depende de ese alcance. Acceso: el de cargarColaboradores y
 * listarCatalogoFeedback; la base vuelve a comprobar el alcance al guardar.
 */
export async function cargarOpcionesFormulario(
  supabase: ClienteServidor,
  emisor: { userId: string; esAdmin: boolean },
) {
  const { opciones, emiteTodos } = await cargarColaboradores(supabase, emisor);
  const catalogo = await listarCatalogoFeedback(supabase, { incluirSoloDireccion: emiteTodos });
  return { opciones, catalogo };
}

/**
 * La bitácora de feedback eliminado (feedback_eliminaciones): foto de lo
 * borrado, motivo, quién y cuándo, de la eliminación más reciente a la más
 * antigua, hasta 500 filas. Acceso (RLS): solo administradores y quien puede
 * eliminar feedback; a cualquier otro le vuelve vacía.
 */
export async function listarFeedbackEliminado(supabase: ClienteServidor) {
  const { data } = await supabase.from("feedback_eliminaciones").select("*").order("eliminado_en", { ascending: false }).limit(500);
  return data ?? [];
}

/**
 * El feedback dirigido a un colaborador (vista v_feedback filtrada por
 * colaborador_usuario_id), del hecho más reciente al más antiguo, hasta 100
 * filas. El filtro explícito es necesario porque a un emisor con ve_todo RLS
 * le entregaría todo el panel; RLS además garantiza que solo vuelva lo propio
 * a quien no tiene el cuadro. No exige permiso sobre el módulo.
 */
export async function listarMisFeedback(supabase: ClienteServidor, usuarioId: string) {
  const { data } = await supabase.from("v_feedback").select("*").eq("colaborador_usuario_id", usuarioId).order("fecha", { ascending: false }).limit(100);
  return data ?? [];
}
