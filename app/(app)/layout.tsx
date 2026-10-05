import type { ReactNode } from "react";
import { AppShell } from "@/components/comunes/app-shell";
import { cargarNotificaciones } from "@/lib/notificaciones";
import { exigirSesion } from "@/lib/sesion";

/**
 * Layout protegido: exige sesión válida, perfil activo y contraseña ya
 * cambiada. Si algo falla, exigirSesion() redirige.
 */
export default async function LayoutApp({ children }: { children: ReactNode }) {
  const { supabase, user, perfil } = await exigirSesion();
  const notificaciones = await cargarNotificaciones(supabase);

  return (
    <AppShell
      perfil={{
        nombre: perfil.nombre,
        rol: perfil.rol,
        cargo: perfil.cargo,
        gestiona_buzon: perfil.gestiona_buzon,
      }}
      email={user.email ?? ""}
      notificaciones={notificaciones}
    >
      {children}
    </AppShell>
  );
}
