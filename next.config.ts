import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que Turbopack tome como raíz un package-lock.json ajeno fuera del repo.
  turbopack: { root: import.meta.dirname },
  // Los bundles del cliente solo pueden incluir variables NEXT_PUBLIC_*; la
  // clave service_role vive en lib/supabase/admin.ts (server-only).
  poweredByHeader: false,

  /**
   * Cabeceras de seguridad. Ninguna estaba puesta.
   *
   * La que más importa aquí es frame-ancestors: sin ella, cualquier web
   * puede meter el panel de administración dentro de un iframe invisible y
   * conseguir que un administrador ya logueado pulse botones sin saberlo.
   *
   * connect-src se cierra al propio sitio y a Supabase: si algún día entra
   * un script de más, no tiene a dónde mandar lo que lea.
   */
  async headers() {
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const csp = [
      "default-src 'self'",
      // Next.js arranca con scripts en línea; sin 'unsafe-inline' la página
      // no hidrata. Se compensa cerrando todo lo demás.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self' ${supabase} ${supabase.replace("https://", "wss://")}`,
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Sin esto, al abrir un documento el navegador manda la URL
          // completa —con el id del documento— al sitio de destino.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
