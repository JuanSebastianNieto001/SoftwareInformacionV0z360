import type { Metadata } from "next";
import Link from "next/link";
import { MatrizPermisos } from "@/components/admin/matriz-permisos";
import { EncabezadoPagina, EstadoVacio } from "@/components/encabezado-pagina";
import { Button } from "@/components/ui/button";
import { exigirAdmin } from "@/lib/sesion";

export const metadata: Metadata = { title: "Permisos" };

export default async function PaginaPermisos({ searchParams }: PageProps<"/admin/permisos">) {
  const sp = await searchParams;
  const { supabase } = await exigirAdmin();

  const [{ data: perfiles }, { data: areas }, { data: permisos }] = await Promise.all([
    supabase.from("perfiles").select("id, nombre, cargo, rol, activo").order("nombre"),
    supabase.from("areas").select("id, nombre, activa").order("nombre"),
    supabase.from("permisos_area").select("usuario_id, area_id, nivel"),
  ]);

  const usuarioInicial = typeof sp.usuario === "string" ? sp.usuario : null;

  if (!areas || areas.length === 0) {
    return (
      <>
        <EncabezadoPagina titulo="Permisos" />
        <EstadoVacio
          titulo="Primero crea al menos un área"
          accion={
            <Button asChild>
              <Link href="/admin/areas">Ir a Áreas</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Permisos por área"
        descripcion="El rol global es el techo: un lector nunca pasa de lectura aunque se le marque edición; un administrador tiene edición en todo sin necesidad de asignación."
      />
      <MatrizPermisos
        usuarios={perfiles ?? []}
        areas={areas}
        permisos={permisos ?? []}
        usuarioInicial={usuarioInicial}
      />
    </>
  );
}
