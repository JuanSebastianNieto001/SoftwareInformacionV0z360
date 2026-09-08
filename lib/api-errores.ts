import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

export function respuestaError(mensaje: string, status: number) {
  return NextResponse.json(
    { error: mensaje },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function respuestaOk<T extends object>(cuerpo: T, status = 200) {
  return NextResponse.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Traduce errores de PostgREST/Postgres a mensaje + código HTTP.
 * 42501 es el código que devuelve Postgres cuando RLS rechaza la fila.
 */
export function mensajePostgrest(error: PostgrestError): { mensaje: string; status: number } {
  switch (error.code) {
    case "42501":
      return { mensaje: "No tienes permiso para esta operación.", status: 403 };
    case "23505":
      return { mensaje: "Ya existe un registro con esos datos.", status: 409 };
    case "23503":
      return { mensaje: "Referencia inválida (el área o usuario no existe).", status: 400 };
    case "23502":
    case "23514":
    case "22P02":
    case "22007":
      return { mensaje: `Datos inválidos: ${error.message}`, status: 400 };
    case "PGRST116":
      return { mensaje: "No encontrado.", status: 404 };
    default:
      console.error("[api] Error de base de datos:", error);
      return { mensaje: "Error interno de base de datos.", status: 500 };
  }
}

export function respuestaDesdePostgrest(error: PostgrestError) {
  const { mensaje, status } = mensajePostgrest(error);
  return respuestaError(mensaje, status);
}

/** Lee JSON del cuerpo sin lanzar. */
export async function leerJson(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
