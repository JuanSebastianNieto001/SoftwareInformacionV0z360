import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que Turbopack tome como raíz un package-lock.json ajeno fuera del repo.
  turbopack: { root: import.meta.dirname },
  // Los bundles del cliente solo pueden incluir variables NEXT_PUBLIC_*; la
  // clave service_role vive en lib/supabase/admin.ts (server-only).
  poweredByHeader: false,
};

export default nextConfig;
