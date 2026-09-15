import type { ReactNode } from "react";
import { AppShell, NavAdmin } from "@/components/app-shell";
import { exigirAdmin } from "@/lib/sesion";

/**
 * Layout del panel de administración. exigirAdmin() es una guardia de
 * navegación: si un no-admin llega aquí, se le redirige. Aunque no lo
 * hiciera, RLS le devolvería listas vacías y rechazaría sus cambios.
 */
export default async function LayoutAdmin({ children }: { children: ReactNode }) {
  const { user, perfil } = await exigirAdmin();

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
      <NavAdmin />
      {children}
    </AppShell>
  );
}
