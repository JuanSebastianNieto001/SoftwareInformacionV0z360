import type { Metadata } from "next";
import Link from "next/link";
import { Download, Inbox } from "lucide-react";
import { BandejaBuzon } from "@/components/admin/bandeja-buzon";
import { EncabezadoPagina, EstadoVacio } from "@/components/encabezado-pagina";
import { TableroBuzon } from "@/components/tablero-buzon";
import { Button } from "@/components/ui/button";
import { exigirGestorBuzon } from "@/lib/sesion";

export const metadata: Metadata = { title: "Buzón" };

export default async function PaginaBuzonGestion() {
  const { supabase } = await exigirGestorBuzon();

  // Las dos consultas son independientes: van en paralelo.
  const [{ data: casos }, { data: personas }] = await Promise.all([
    supabase.from("sugerencias").select("*").order("creado_en", { ascending: false }).limit(500),
    supabase.from("perfiles").select("id, nombre").eq("activo", true).order("nombre"),
  ]);

  return (
    <>
      <EncabezadoPagina
        titulo="Buzón"
        descripcion="Pulsa Gestionar para abrir un caso: pasa a En proceso solo. Para cerrarlo hay que adjuntar el pantallazo del correo enviado."
        acciones={
          <Button variant="outline" asChild>
            <Link href="/api/buzon/csv" prefetch={false}>
              <Download /> Exportar CSV
            </Link>
          </Button>
        }
      />

      <TableroBuzon casos={casos ?? []} />

      {!casos || casos.length === 0 ? (
        <EstadoVacio
          icono={<Inbox />}
          titulo="El buzón está vacío"
          descripcion="Cuando alguien envíe una sugerencia o una queja, aparecerá aquí con su número de radicado."
        />
      ) : (
        <BandejaBuzon casos={casos} personas={personas ?? []} />
      )}
    </>
  );
}
