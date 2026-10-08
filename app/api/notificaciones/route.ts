/**
 * Las notificaciones sin leer de quien pregunta, generando antes las que
 * falten. Lo usa la campana para refrescarse sola (cada minuto y al volver
 * a la pestaña), sin que haya que recargar la página.
 */
import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  await Promise.allSettled([
    supabase.rpc("generar_alertas_cumpleanos"),
    supabase.rpc("generar_alertas_calidad"),
    supabase.rpc("generar_alertas_feedback"),
  ]);

  const { data } = await supabase
    .from("notificaciones")
    .select("id, titulo, cuerpo, enlace, creado_en")
    .is("leida_en", null)
    .order("creado_en", { ascending: false })
    .limit(20);

  return NextResponse.json(
    { notificaciones: data ?? [] },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
