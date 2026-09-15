"use server";

import { revalidatePath } from "next/cache";
import { mensajePostgrest } from "@/lib/api-errores";
import { exigirSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esquemaSugerencia, esquemaTratamiento, primerError } from "@/lib/validaciones";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Acciones del buzón. Como en el resto del proyecto, ninguna decide "si es
 * admin" en TypeScript: usan el cliente de sesión y dejan que RLS acepte o
 * rechace. Aquí solo se valida la forma de los datos y se rellenan los
 * campos que el cliente no debe poder elegir.
 */

export async function enviarSugerencia(datos: unknown): Promise<Resultado> {
  const parsed = esquemaSugerencia.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };

  const { supabase, user, perfil } = await exigirSesion();

  // El emisor lo pone el servidor, nunca el formulario: la política de RLS
  // exige emisor_id = auth.uid(), así que un cliente manipulado no podría
  // firmar a nombre de otro, pero tampoco tiene sentido dejarle intentarlo.
  const { data, error } = await supabase
    .from("sugerencias")
    .insert({
      ...parsed.data,
      emisor_id: user.id,
      emisor_email: user.email ?? "",
      emisor_nombre: perfil.nombre,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };

  revalidatePath("/buzon");
  revalidatePath("/admin/buzon");
  return { ok: true, id: data.id };
}

export async function tratarSugerencia(datos: unknown): Promise<Resultado> {
  const parsed = esquemaTratamiento.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };

  const { id, ...cambios } = parsed.data;
  const supabase = await crearClienteServidor();

  // La fecha de cierre la pone el servidor, no el navegador de quien edita:
  // una evidencia fechada con el reloj del cliente no prueba nada. Reabrir
  // un caso la borra, para que no quede una fecha de cierre sin cierre.
  const cerrada_en = cambios.estado === "cerrada" ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("sugerencias")
    .update({ ...cambios, cerrada_en })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  if (!data) return { ok: false, error: "Caso no encontrado o sin permiso para tratarlo." };

  revalidatePath("/admin/buzon");
  revalidatePath("/buzon");
  return { ok: true, id };
}
