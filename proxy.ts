import type { NextRequest } from "next/server";
import { actualizarSesion } from "@/lib/supabase/proxy";

/**
 * Next.js 16 renombró `middleware.ts` a `proxy.ts` (misma función,
 * runtime Node.js). Refresca la sesión de Supabase y redirige a /login
 * cuando no hay usuario. La autorización real vive en RLS.
 */
export async function proxy(request: NextRequest) {
  return actualizarSesion(request);
}

export const config = {
  matcher: [
    /*
     * Todo excepto:
     *  - _next/static, _next/image (assets de Next)
     *  - favicon, manifiesto PWA, service worker e íconos
     *  - imágenes estáticas
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|iconos/|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
