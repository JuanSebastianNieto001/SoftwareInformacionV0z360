// Ruta del cron diario de purga (vercel.json: "0 8 * * *", hora UTC), que
// retira del almacenamiento los documentos vencidos. El proxy la deja pasar
// sin sesión (RUTAS_API_SIN_SESION), así que su única credencial es
// CRON_SECRET; por eso la comparación del secreto se cuida tanto.
import { timingSafeEqual } from "node:crypto";
import { respuestaError } from "@/lib/api/errores";
import { urlSupabase } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Disparador alternativo de la purga desde Vercel Cron (ver vercel.json).
 * Vercel envía `Authorization: Bearer <CRON_SECRET>`. Aquí solo
 * reenviamos la orden a la Edge Function, que es la única que contiene la
 * lógica de purga. Si prefieres pg_cron, no necesitas esta ruta.
 */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return respuestaError("CRON_SECRET no configurado en el servidor.", 500);

  // Comparación en tiempo constante: con `!==` el tiempo de respuesta
  // revela cuántos caracteres iniciales acertó quien prueba secretos.
  const recibido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${secreto}`);
  if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) {
    return respuestaError("No autorizado", 401);
  }

  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!clave) return respuestaError("SUPABASE_SERVICE_ROLE_KEY no configurada.", 500);

  const destino = `${urlSupabase()}/functions/v1/purgar`;
  const res = await fetch(destino, {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });

  const cuerpo = await res.text();
  console.log("[cron purgar]", res.status, cuerpo);

  return new Response(cuerpo, {
    status: res.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
