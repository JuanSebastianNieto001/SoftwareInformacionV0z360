"use server";

// Acciones del módulo de retroalimentación operativa: registrar feedback del
// catálogo, gestionarlo (estado, plan, seguimiento) y la respuesta de
// conformidad del colaborador. La autorización vive en RLS y en las funciones
// de la base; aquí solo se valida la forma y se traducen los errores.
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensajePostgrest } from "@/lib/api-errores";
import { registrarAcceso } from "@/lib/auditoria";
import { exigirSesion } from "@/lib/sesion";
import {
  esquemaConformidadFeedback,
  esquemaFeedback,
  esquemaGestionFeedback,
  primerError,
} from "@/lib/validaciones";
import type { PostgrestError } from "@supabase/supabase-js";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

const esUuid = (v: string) => z.uuid().safeParse(v).success;
const SIN_PERMISO = "No tienes permiso para modificar este feedback.";

function traducir(error: PostgrestError): string {
  if (error.message.includes("liderazgo")) return "El feedback de liderazgo y equipo solo lo registra dirección o gerencia.";
  return mensajePostgrest(error).mensaje;
}

function refrescar(id?: string) {
  revalidatePath("/feedback");
  revalidatePath("/mis-feedback");
  if (id) revalidatePath(`/feedback/${id}`);
}

// ---------- Registrar ----------

export async function crearFeedback(datos: unknown): Promise<Resultado> {
  const parsed = esquemaFeedback.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const d = parsed.data;
  const { supabase, user, perfil } = await exigirSesion();

  const { data: areaId } = await supabase.rpc("area_modulo", { m: "feedback" });
  if (!areaId) return { ok: false, error: "El módulo de retroalimentación no está disponible." };

  // El buscador manda la cuenta elegida (asesor o administrativo). Si llegó
  // solo el nombre, se intenta el vínculo con la estructura de calidad, y de
  // ella se heredan cédula y team leader cuando no se enviaron.
  const { data: asesor } = await supabase
    .from("calidad_asesores")
    .select("usuario_id, cedula, team_leader")
    .ilike("nombre", d.colaborador_nombre.trim())
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("feedback")
    .insert({
      catalogo_id: d.catalogo_id,
      area_id: areaId,
      colaborador_nombre: d.colaborador_nombre,
      colaborador_cedula: d.colaborador_cedula ?? asesor?.cedula ?? null,
      colaborador_usuario_id: d.colaborador_usuario_id ?? asesor?.usuario_id ?? null,
      team_leader: d.team_leader ?? asesor?.team_leader ?? null,
      fecha: d.fecha,
      gravedad: d.gravedad,
      severidad: d.severidad,
      descripcion: d.descripcion,
      fecha_seguimiento: d.fecha_seguimiento,
      creado_por: user.id,
      creado_por_nombre: perfil.nombre,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: traducir(error) };

  refrescar(data.id);
  return { ok: true, id: data.id };
}

export async function actualizarFeedback(id: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaFeedback.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const d = parsed.data;
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase
    .from("feedback")
    .update({
      catalogo_id: d.catalogo_id,
      colaborador_nombre: d.colaborador_nombre,
      colaborador_usuario_id: d.colaborador_usuario_id,
      colaborador_cedula: d.colaborador_cedula,
      team_leader: d.team_leader,
      fecha: d.fecha,
      gravedad: d.gravedad,
      severidad: d.severidad,
      descripcion: d.descripcion,
      fecha_seguimiento: d.fecha_seguimiento,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: SIN_PERMISO };

  refrescar(id);
  return { ok: true, id };
}

/** Estado y fecha de seguimiento: gestión del cuadro. El compromiso lo escribe el colaborador al firmar. */
export async function gestionarFeedback(id: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaGestionFeedback.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase
    .from("feedback")
    .update({ estado: parsed.data.estado, fecha_seguimiento: parsed.data.fecha_seguimiento })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: SIN_PERMISO };

  refrescar(id);
  return { ok: true, id };
}

export async function eliminarFeedback(id: string): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const { supabase, user, perfil } = await exigirSesion();

  const { data, error } = await supabase.from("feedback").delete().eq("id", id).select("id, colaborador_nombre").maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: "No se pudo eliminar: no existe o no tienes nivel Total." };

  await registrarAcceso(supabase, user, {
    accion: "eliminar",
    documento: { id: null, titulo: `Feedback · ${data.colaborador_nombre}`, area_nombre: "Retroalimentación" },
    perfilNombre: perfil.nombre,
    request: { headers: await headers() },
  });
  refrescar();
  return { ok: true };
}

// ---------- Conformidad del colaborador ----------

export async function responderConformidad(datos: unknown): Promise<Resultado> {
  const parsed = esquemaConformidadFeedback.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();

  const { error } = await supabase.rpc("responder_feedback", {
    p_id: parsed.data.id,
    p_conformidad: parsed.data.conformidad,
    p_comentario: parsed.data.comentario ?? null,
    p_compromiso: parsed.data.compromiso ?? null,
  });
  if (error) {
    if (error.message.includes("compromiso")) return { ok: false, error: "Escribe tu compromiso de mejora antes de firmar." };
    return { ok: false, error: traducir(error) };
  }

  refrescar(parsed.data.id);
  return { ok: true, id: parsed.data.id };
}
