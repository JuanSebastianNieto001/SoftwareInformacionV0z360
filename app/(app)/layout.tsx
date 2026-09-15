import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { exigirSesion } from "@/lib/sesion";

/**
 * Layout protegido: exige sesión válida, perfil activo y contraseña ya
 * cambiada. Si algo falla, exigirSesion() redirige.
 */
export default async function LayoutApp({ children }: { children: ReactNode }) {
  const { user, perfil } = await exigirSesion();

  return (
    <AppShell
      perfil={{
        nombre: perfil.nombre,
        rol: perfil.rol,
        cargo: perfil.cargo,
        gestiona_buzon: perfil.gestiona_buzon,
      }}
      email={user.email ?? ""}
    >
      {children}
    </AppShell>
  );
}
