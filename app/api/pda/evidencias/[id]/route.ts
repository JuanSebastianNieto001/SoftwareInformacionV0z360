/**
 * Único camino por el que una evidencia del PDA llega al navegador.
 *
 * El bucket `pda` es privado. La fila de `pda_evidencias` solo la ve quien
 * tiene el cuadro (RLS), y la URL firmada dura 60 segundos: alcanza para
 * abrir el archivo, no para reenviar el enlace. Cada apertura queda en la
 * auditoría como descarga.
 */
import { registrarAcceso } from "@/lib/auditoria";
import { exigirModulo } from "@/lib/modulos-acceso";

export const dynamic = "force-dynamic";

const SEGUNDOS_FIRMA = 60;
const SIN_CACHE = { "Cache-Control": "no-store, private" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, perfil } = await exigirModulo("pda");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response("Identificador inválido.", { status: 400, headers: SIN_CACHE });
  }

  const { data: ev } = await supabase
    .from("pda_evidencias")
    .select("storage_path, nombre_archivo, objetivo_id")
    .eq("id", id)
    .maybeSingle();
  if (!ev) return new Response("Evidencia no encontrada.", { status: 404, headers: SIN_CACHE });

  const { data: firmada, error } = await supabase.storage
    .from("pda")
    .createSignedUrl(ev.storage_path, SEGUNDOS_FIRMA, { download: false });
  if (error || !firmada) {
    console.error("[pda] No se pudo firmar la evidencia", id, error?.message);
    return new Response("No se pudo abrir la evidencia.", { status: 500, headers: SIN_CACHE });
  }

  await registrarAcceso(supabase, user, {
    accion: "descargar",
    documento: { id: null, titulo: `Evidencia PDA · ${ev.nombre_archivo}`, area_nombre: "PDA" },
    perfilNombre: perfil.nombre,
    request: req,
  });

  return new Response(null, { status: 302, headers: { Location: firmada.signedUrl, ...SIN_CACHE } });
}
