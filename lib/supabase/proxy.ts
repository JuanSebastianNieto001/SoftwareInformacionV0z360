import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clavePublicaSupabase, urlSupabase } from "./env";

/** Rutas accesibles sin sesión. Todo lo demás exige usuario autenticado. */
const RUTAS_PUBLICAS = ["/login", "/offline"];

/** Rutas de API que se protegen con su propio secreto (cron), no con sesión. */
const RUTAS_API_SIN_SESION = ["/api/cron/"];

/**
 * Caducidad por inactividad. Supabase renueva la sesión mientras el
 * navegador siga pidiendo páginas, así que una sesión abierta en un equipo
 * compartido duraba indefinidamente: quien se sentara después entraba con
 * el nombre del anterior. Esta cookie guarda la última actividad; pasado
 * el plazo sin ninguna petición, la siguiente cierra la sesión.
 *
 * Treinta minutos es el equilibrio entre no molestar a quien trabaja con
 * la aplicación abierta y no dejar una sesión viva toda la tarde.
 */
const COOKIE_ACTIVIDAD = "v360_actividad";
const INACTIVIDAD_MAXIMA_MS = 30 * 60 * 1000;

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

  if (user) {
    const ultima = Number(request.cookies.get(COOKIE_ACTIVIDAD)?.value ?? 0);
    const ahora = Date.now();

    if (ultima > 0 && ahora - ultima > INACTIVIDAD_MAXIMA_MS) {
      // signOut escribe las cookies de sesión ya vacías en `respuesta`
      // (vía setAll); se copian a la redirección para que lleguen al
      // navegador junto con el cambio de página.
      //
      // scope "local": caduca SOLO este navegador. Con el global, un
      // equipo con la cookie de actividad vieja revocaba también la
      // sesión que la persona acababa de abrir en otro computador.
      await supabase.auth.signOut({ scope: "local" });
      if (esApi) {
        const sinSesion = NextResponse.json({ error: "Sesión caducada por inactividad" }, { status: 401 });
        respuesta.cookies.getAll().forEach((c) => sinSesion.cookies.set(c));
        sinSesion.cookies.delete(COOKIE_ACTIVIDAD);
        return sinSesion;
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("motivo", "inactividad");
      const redireccion = NextResponse.redirect(url);
      respuesta.cookies.getAll().forEach((c) => redireccion.cookies.set(c));
      redireccion.cookies.delete(COOKIE_ACTIVIDAD);
      return redireccion;
    }

    respuesta.cookies.set(COOKIE_ACTIVIDAD, String(ahora), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }

  // Sin sesión no debe quedar rastro de actividad: si la cookie sobrevivió
  // (un cierre de sesión antiguo, un navegador que guardó la del día
  // anterior), el siguiente inicio de sesión en ese equipo sería expulsado
  // al instante como "inactividad". Se limpia aquí, con lo que al llegar a
  // /login el equipo ya está sano.
  const limpiarActividad = !user && request.cookies.has(COOKIE_ACTIVIDAD);
  if (limpiarActividad) respuesta.cookies.delete(COOKIE_ACTIVIDAD);

  if (!user && !esPublica && !esApiSinSesion) {
    if (esApi) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("volver", pathname);
    const redireccion = NextResponse.redirect(url);
    if (limpiarActividad) redireccion.cookies.delete(COOKIE_ACTIVIDAD);
    return redireccion;
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    const redireccion = NextResponse.redirect(url);
    respuesta.cookies.getAll().forEach((c) => redireccion.cookies.set(c));
    return redireccion;
  }

  return respuesta;
}
