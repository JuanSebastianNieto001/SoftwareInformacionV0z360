import { NextResponse, type NextRequest } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Cierra la sesión y redirige a /login. Existe como Route Handler porque
 * los Server Components no pueden borrar cookies; el layout redirige aquí
 * cuando detecta un perfil desactivado.
 */
export async function GET(req: NextRequest) {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();

  const destino = new URL("/login", req.url);
  const motivo = req.nextUrl.searchParams.get("motivo");
  if (motivo) destino.searchParams.set("motivo", motivo);

  return NextResponse.redirect(destino, { status: 303 });
}
