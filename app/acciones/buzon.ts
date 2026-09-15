"use server";

import { revalidatePath } from "next/cache";
import { mensajePostgrest } from "@/lib/api-errores";
import { rutaEvidencia } from "@/lib/buzon";
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
  revalidatePath("/buzon/gestion");
  return { ok: true, id: data.id };
}

export async function tratarSugerencia(datos: unknown): Promise<Resultado> {
  const parsed = esquemaTratamiento.safeParse(datos);
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) };

  const d = parsed.data;
  const supabase = await crearClienteServidor();
  const ahora = new Date().toISOString();

  // Los campos se listan uno a uno en lugar de esparcir el objeto validado:
  // este lleva 'tipo', que es del emisor y no debe poder reescribirse desde
  // la pantalla de tratamiento.
  const { data, error } = await supabase
    .from("sugerencias")
    .update({
      estado: d.estado,
      responsable_id: d.responsable_id,
      analisis_causa: d.analisis_causa,
      accion_tomada: d.accion_tomada,
      fecha_compromiso: d.fecha_compromiso,
      eficacia_verificada: d.eficacia_verificada,
      eficacia_nota: d.eficacia_nota,
      respuesta_emisor: d.respuesta_emisor,
      evidencia_nombre: d.evidencia_nombre,
      // La ruta la arma el servidor con el id del caso: el cliente solo
      // dice como se llama el archivo que acaba de subir, asi que no puede
      // apuntar la evidencia de un expediente a la de otro.
      evidencia_path: d.evidencia_nombre ? rutaEvidencia(d.id, d.evidencia_nombre) : null,
      ...(d.evidencia_nueva ? { evidencia_subida_en: ahora } : {}),
      // La fecha de cierre la pone el servidor, no el navegador de quien
      // edita: una evidencia fechada con el reloj del cliente no prueba
      // nada. Reabrir el caso la borra, para que no quede fecha sin cierre.
      cerrada_en: d.estado === "cerrada" ? ahora : null,
    })
    .eq("id", d.id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: mensajePostgrest(error).mensaje };
  if (!data) return { ok: false, error: "Caso no encontrado o sin permiso para tratarlo." };

  revalidatePath("/buzon/gestion");
  revalidatePath("/buzon");
  return { ok: true, id: d.id };
}
