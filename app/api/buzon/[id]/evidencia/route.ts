import { exigirGestorBuzonApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";

/** Segundos de validez de la URL firmada: alcanza para abrir, no para reenviar. */
const SEGUNDOS_FIRMA = 60;

const SIN_CACHE = { "Cache-Control": "no-store, private" };

/**
 * Único camino por el que un pantallazo de evidencia llega al navegador.
 *
 * El bucket es privado y sus políticas solo dejan leer a quien gestiona el
 * buzón, así que ni siquiera quien envió la PQR puede abrir la prueba: un
 * pantallazo de un correo puede mostrar datos de terceros.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirGestorBuzonApi();
  if (ctx.error) return ctx.error;

  const { id } = await params;

  const { data: caso } = await ctx.supabase
    .from("sugerencias")
    .select("evidencia_path")
    .eq("id", id)
    .maybeSingle();

  if (!caso?.evidencia_path) {
    return new Response("Este caso no tiene evidencia adjunta.", {
      status: 404,
      headers: SIN_CACHE,
    });
  }

  const { data: firmada, error } = await ctx.supabase.storage
    .from("evidencias")
    .createSignedUrl(caso.evidencia_path, SEGUNDOS_FIRMA);

  if (error || !firmada) {
    console.error("[evidencia] Error al firmar", id, error?.message);
    return new Response("Error al firmar", { status: 500, headers: SIN_CACHE });
  }

  return new Response(null, {
    status: 302,
    headers: { Location: firmada.signedUrl, ...SIN_CACHE },
  });
}
