import type { Metadata } from "next";
import { GestionUsuarios } from "@/components/admin/gestion-usuarios";
import { EncabezadoPagina } from "@/components/encabezado-pagina";
import { exigirAdmin } from "@/lib/sesion";

export const metadata: Metadata = { title: "Usuarios" };

/**
 * La lista se carga en el cliente desde /api/admin/usuarios porque los
 * correos viven en auth.users, que solo se lee con service_role, y esa
 * clave solo se usa en Route Handlers.
 */
export default async function PaginaUsuarios() {
  const { user } = await exigirAdmin();

  return (
    <>
      <EncabezadoPagina
        titulo="Usuarios"
        descripcion="El registro público está cerrado: aquí se crean las cuentas. Desactiva en lugar de borrar para conservar la trazabilidad."
      />
      <GestionUsuarios miId={user.id} />
    </>
  );
}
