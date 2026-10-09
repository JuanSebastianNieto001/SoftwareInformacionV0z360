/**
 * Bandeja del buzón para quien lo gestiona: tablero de indicadores y
 * tratamiento de cada PQR.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Download, Inbox } from "lucide-react";
import { BandejaBuzon } from "@/components/buzon/bandeja-buzon";
import { EncabezadoPagina, EstadoVacio } from "@/components/comunes/encabezado-pagina";
import { TableroBuzon } from "@/components/buzon/tablero-buzon";
import { Button } from "@/components/ui/button";
import { listarCasosDelBuzon, listarPersonasActivas } from "@/lib/buzon/datos";
import { exigirGestorBuzon } from "@/lib/sesion";

export const metadata: Metadata = { title: "Buzón" };

export default async function PaginaBuzonGestion() {
  const { supabase } = await exigirGestorBuzon();

  // Las dos consultas son independientes: van en paralelo.
  const [casos, personas] = await Promise.all([
    listarCasosDelBuzon(supabase),
    listarPersonasActivas(supabase),
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
