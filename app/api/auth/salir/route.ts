// GET /api/auth/salir?motivo=…: cierre de sesión forzado. Hoy solo la usa
// exigirSesion (lib/sesion.ts) para expulsar a un perfil inexistente o
// desactivado; el «Cerrar sesión» del menú usa la acción cerrarSesion.
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

  const respuesta = NextResponse.redirect(destino, { status: 303 });
  // La marca de actividad no debe sobrevivir al cierre de sesión: si queda,
  // el siguiente inicio de sesión en este equipo sería expulsado al
  // instante por "inactividad".
  respuesta.cookies.delete("v360_actividad");
  return respuesta;
}
