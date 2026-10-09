"use server";

// Acciones del módulo PDA: el plan del mes, sus objetivos, la lista de
// chequeo de cada uno y las evidencias.
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensajePostgrest } from "@/lib/api/errores";
import { registrarAcceso } from "@/lib/auditoria";
import { exigirSesion } from "@/lib/sesion";
import { rutaEvidenciaPda } from "@/lib/pda";
import {
  esquemaCierreObjetivoPda,
  esquemaEvidenciaPda,
  esquemaObjetivoPda,
  esquemaPlanPda,
  esquemaTareaPda,
  primerError,
} from "@/lib/validaciones";
import type { PostgrestError } from "@supabase/supabase-js";
import type { Accion } from "@/lib/supabase/tipos";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

const esUuid = (v: string) => z.uuid().safeParse(v).success;

/**
 * Nada comprueba permisos en TypeScript: el cliente de sesión deja que las
 * políticas de pda_* acepten o rechacen (Edición para crear, marcar y
 * subir; Total o admin para borrar un PDA o un objetivo). Un update que RLS
 * no deja ver devuelve cero filas en lugar de error, así que se pide la
 * fila de vuelta y su ausencia se explica como falta de permiso.
 */

const SIN_PERMISO = "No tienes permiso para modificar el PDA.";

function traducir(error: PostgrestError): string {
  if (error.message.includes("está cerrado")) return "El PDA está cerrado. Reábrelo para modificarlo.";
  if (error.code === "23505") return "Ya existe un PDA para ese mes y ese cargo.";
  return mensajePostgrest(error).mensaje;
}

function refrescar(planId?: string) {
  revalidatePath("/pda");
  if (planId) revalidatePath(`/pda/${planId}`);
}

/** Evidencias: subir y retirar quedan en la auditoría, como un documento. */
async function anotar(
  sesion: Awaited<ReturnType<typeof exigirSesion>>,
  accion: Accion,
  titulo: string,
) {
  await registrarAcceso(sesion.supabase, sesion.user, {
    accion,
    documento: { id: null, titulo, area_nombre: "PDA" },
    perfilNombre: sesion.perfil.nombre,
    request: { headers: await headers() },
  });
}

async function areaPda(supabase: Awaited<ReturnType<typeof exigirSesion>>["supabase"]) {
  const { data } = await supabase.rpc("area_modulo", { m: "pda" });
  return data ?? null;
}

// ---------- Plan del mes ----------

export async function crearPlan(datos: unknown): Promise<Resultado> {
  const parsed = esquemaPlanPda.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase, user } = await exigirSesion();

  const areaId = await areaPda(supabase);
  if (!areaId) return { ok: false, error: "El módulo PDA no está disponible." };

  const { data, error } = await supabase
    .from("pda_planes")
    .insert({ ...parsed.data, area_id: areaId, creado_por: user.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: traducir(error) };

  refrescar(data.id);
  return { ok: true, id: data.id };
}

export async function actualizarPlan(id: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaPlanPda.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase.from("pda_planes").update(parsed.data).eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: SIN_PERMISO };

  refrescar(id);
  return { ok: true, id };
}

/** Cerrar congela el PDA (la base rechaza cambios en objetivos, actividades y evidencias); reabrir lo descongela. */
export async function cambiarEstadoPlan(id: string, cerrar: boolean): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase
    .from("pda_planes")
    .update({ estado: cerrar ? "cerrado" : "abierto" })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: SIN_PERMISO };

  refrescar(id);
  return { ok: true, id };
}

export async function eliminarPlan(id: string): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Identificador inválido" };
  const sesion = await exigirSesion();
  const { supabase } = sesion;

  // Los binarios no se borran en cascada: se retiran antes que la fila.
  const { data: evidencias } = await supabase.from("pda_evidencias").select("storage_path").like("storage_path", `${id}/%`);
  const rutas = (evidencias ?? []).map((e) => e.storage_path);
  if (rutas.length) {
    const { error: errorStorage } = await supabase.storage.from("pda").remove(rutas);
    if (errorStorage) return { ok: false, error: `No se pudieron borrar las evidencias: ${errorStorage.message}` };
  }

  const { data, error } = await supabase.from("pda_planes").delete().eq("id", id).select("id, titulo").maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: "No se pudo eliminar: no existe o no tienes nivel Total." };

  await anotar(sesion, "eliminar", `PDA · ${data.titulo}`);
  refrescar();
  return { ok: true };
}

// ---------- Objetivos (las filas de la matriz) ----------

export async function crearObjetivo(planId: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(planId)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaObjetivoPda.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase, user } = await exigirSesion();

  const areaId = await areaPda(supabase);
  if (!areaId) return { ok: false, error: "El módulo PDA no está disponible." };

  // area_id lo impone la base a partir del plan; se envía para cumplir el esquema.
  const { data, error } = await supabase
    .from("pda_objetivos")
    .insert({ ...parsed.data, plan_id: planId, area_id: areaId, creado_por: user.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: traducir(error) };

  refrescar(planId);
  return { ok: true, id: data.id };
}

export async function actualizarObjetivo(id: string, planId: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(id) || !esUuid(planId)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaObjetivoPda.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase.from("pda_objetivos").update(parsed.data).eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: SIN_PERMISO };

  refrescar(planId);
  return { ok: true, id };
}

/** Columnas L–N del formato: lo que se escribe al cerrar el mes. Con cumplimiento vacío el objetivo vuelve a «en curso». */
export async function cerrarObjetivo(id: string, planId: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(id) || !esUuid(planId)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaCierreObjetivoPda.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase.from("pda_objetivos").update(parsed.data).eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: SIN_PERMISO };

  refrescar(planId);
  return { ok: true, id };
}

export async function eliminarObjetivo(id: string, planId: string): Promise<Resultado> {
  if (!esUuid(id) || !esUuid(planId)) return { ok: false, error: "Identificador inválido" };
  const { supabase } = await exigirSesion();

  const { data: evidencias } = await supabase.from("pda_evidencias").select("storage_path").eq("objetivo_id", id);
  const rutas = (evidencias ?? []).map((e) => e.storage_path);
  if (rutas.length) {
    const { error: errorStorage } = await supabase.storage.from("pda").remove(rutas);
    if (errorStorage) return { ok: false, error: `No se pudieron borrar las evidencias: ${errorStorage.message}` };
  }

  const { data, error } = await supabase.from("pda_objetivos").delete().eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: "No se pudo eliminar: no existe o no tienes nivel Total." };

  refrescar(planId);
  return { ok: true };
}

// ---------- Lista de chequeo ----------

export async function crearTarea(objetivoId: string, planId: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(objetivoId) || !esUuid(planId)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaTareaPda.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const { supabase, user } = await exigirSesion();

  const areaId = await areaPda(supabase);
  if (!areaId) return { ok: false, error: "El módulo PDA no está disponible." };

  const { data, error } = await supabase
    .from("pda_tareas")
    .insert({ ...parsed.data, objetivo_id: objetivoId, area_id: areaId, creado_por: user.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: traducir(error) };

  refrescar(planId);
  return { ok: true, id: data.id };
}

/** Marcar o desmarcar: quién y cuándo lo escribe el trigger de la base. */
export async function marcarTarea(id: string, planId: string, completada: boolean): Promise<Resultado> {
  if (!esUuid(id) || !esUuid(planId)) return { ok: false, error: "Identificador inválido" };
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase.from("pda_tareas").update({ completada }).eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: SIN_PERMISO };

  refrescar(planId);
  return { ok: true, id };
}

export async function eliminarTarea(id: string, planId: string): Promise<Resultado> {
  if (!esUuid(id) || !esUuid(planId)) return { ok: false, error: "Identificador inválido" };
  const { supabase } = await exigirSesion();

  const { data, error } = await supabase.from("pda_tareas").delete().eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: SIN_PERMISO };

  refrescar(planId);
  return { ok: true };
}

// ---------- Evidencias ----------

/**
 * Paso 2 de la subida. El navegador ya dejó el archivo en el bucket `pda`
 * (su política exigió Edición sobre el cuadro). Aquí se confirma que el
 * objeto existe, se toman su tamaño y tipo reales y se inserta la fila. Si
 * la fila no entra, el archivo se retira para no dejar huérfanos.
 */
export async function registrarEvidencia(planId: string, datos: unknown): Promise<Resultado> {
  if (!esUuid(planId)) return { ok: false, error: "Identificador inválido" };
  const parsed = esquemaEvidenciaPda.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };
  const d = parsed.data;
  const sesion = await exigirSesion();
  const { supabase, user } = sesion;

  const areaId = await areaPda(supabase);
  if (!areaId) return { ok: false, error: "El módulo PDA no está disponible." };

  const ruta = rutaEvidenciaPda(planId, d.objetivo_id, d.nombre_archivo);
  const { data: objetos, error: errorLista } = await supabase.storage.from("pda").list(`${planId}/${d.objetivo_id}`, { limit: 100 });
  if (errorLista) return { ok: false, error: `No se pudo verificar el archivo: ${errorLista.message}` };
  const objeto = objetos?.find((o) => o.name === d.nombre_archivo);
  if (!objeto) return { ok: false, error: "El archivo no aparece en el almacenamiento. Vuelve a intentar la subida." };

  const meta = (objeto.metadata ?? {}) as { size?: number; mimetype?: string };
  const tamano = typeof meta.size === "number" ? meta.size : d.tamano_bytes;
  const mime = typeof meta.mimetype === "string" && meta.mimetype ? meta.mimetype : d.mime;

  const { data, error } = await supabase
    .from("pda_evidencias")
    .insert({
      objetivo_id: d.objetivo_id,
      area_id: areaId,
      storage_path: ruta,
      nombre_archivo: d.nombre_archivo,
      mime,
      tamano_bytes: tamano,
      descripcion: d.descripcion,
      subido_por: user.id,
    })
    .select("id")
    .single();
  if (error) {
    await supabase.storage.from("pda").remove([ruta]);
    if (error.code === "23505") return { ok: false, error: "Ya hay una evidencia con ese nombre en este objetivo." };
    return { ok: false, error: traducir(error) };
  }

  await anotar(sesion, "subir", `Evidencia PDA · ${d.nombre_archivo}`);
  refrescar(planId);
  return { ok: true, id: data.id };
}

/** Orden: auditar → borrar archivo → borrar fila, para que quede rastro aunque falle el segundo paso. */
export async function eliminarEvidencia(id: string, planId: string): Promise<Resultado> {
  if (!esUuid(id) || !esUuid(planId)) return { ok: false, error: "Identificador inválido" };
  const sesion = await exigirSesion();
  const { supabase } = sesion;

  const { data: ev } = await supabase.from("pda_evidencias").select("storage_path, nombre_archivo").eq("id", id).maybeSingle();
  if (!ev) return { ok: false, error: "Evidencia no encontrada." };

  await anotar(sesion, "eliminar", `Evidencia PDA · ${ev.nombre_archivo}`);

  const { error: errorStorage } = await supabase.storage.from("pda").remove([ev.storage_path]);
  if (errorStorage) return { ok: false, error: `No se pudo borrar el archivo: ${errorStorage.message}` };

  const { data, error } = await supabase.from("pda_evidencias").delete().eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, error: traducir(error) };
  if (!data) return { ok: false, error: SIN_PERMISO };

  refrescar(planId);
  return { ok: true };
}
