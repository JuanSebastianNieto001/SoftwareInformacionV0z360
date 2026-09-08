import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clavePublicaSupabase, urlSupabase } from "./env";

/** Rutas accesibles sin sesión. Todo lo demás exige usuario autenticado. */
const RUTAS_PUBLICAS = ["/login", "/offline"];

/** Rutas de API que se protegen con su propio secreto (cron), no con sesión. */
const RUTAS_API_SIN_SESION = ["/api/cron/"];

/**
 * Refresca la sesión de Supabase en cada petición y redirige a /login si
 * no hay usuario. Se ejecuta desde proxy.ts (antes middleware.ts).
 *
 * Importante: esto es una comodidad de navegación, NO el mecanismo de
 * seguridad. Aunque alguien saltara esta redirección, RLS no le devolvería
 * ningún dato.
 */
export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(urlSupabase(), clavePublicaSupabase(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesAEscribir) {
        cookiesAEscribir.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        respuesta = NextResponse.next({ request });
        cookiesAEscribir.forEach(({ name, value, options }) =>
          respuesta.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser() valida el token contra Supabase Auth en cada petición.
  // No usar getSession() aquí: no verifica la firma del JWT.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const esPublica = RUTAS_PUBLICAS.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
  const esApiSinSesion = RUTAS_API_SIN_SESION.some((r) =>
    pathname.startsWith(r),
  );
  const esApi = pathname.startsWith("/api/");

  if (!user && !esPublica && !esApiSinSesion) {
    if (esApi) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("volver", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return respuesta;
}
