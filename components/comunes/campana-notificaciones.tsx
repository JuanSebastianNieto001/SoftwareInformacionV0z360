"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { Bell, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { marcarNotificacionLeida, marcarTodasLeidas } from "@/app/acciones/cumpleanos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatearFechaHora } from "@/lib/formato";

export type NotificacionShell = {
  id: string;
  titulo: string;
  cuerpo: string | null;
  enlace: string | null;
  creado_en: string;
};

/**
 * La campana de la cabecera: lo pendiente de leer, y un aviso en pantalla
 * la primera vez que aparece cada alerta en esta pestaña. El aviso no se
 * repite al navegar porque se recuerda en sessionStorage qué ya se mostró;
 * si se cierra el navegador, vuelve a avisar, que es lo que se quiere de
 * una alarma.
 */
export function CampanaNotificaciones({ notificaciones }: { notificaciones: NotificacionShell[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const n = notificaciones.length;

  useEffect(() => {
    let vistas: string[] = [];
    try {
      vistas = JSON.parse(sessionStorage.getItem("alertas-vistas") ?? "[]");
    } catch {
      vistas = [];
    }
    const nuevas = notificaciones.filter((x) => !vistas.includes(x.id));
    for (const x of nuevas) {
      toast(x.titulo, {
        description: x.cuerpo ?? undefined,
        duration: 12000,
        action: x.enlace ? { label: "Ver", onClick: () => router.push(x.enlace as string) } : undefined,
      });
    }
    if (nuevas.length) {
      try {
        sessionStorage.setItem("alertas-vistas", JSON.stringify([...vistas, ...nuevas.map((x) => x.id)]));
      } catch {
        // sin almacenamiento, se avisa igual; solo se perderá la memoria entre pantallas
      }
    }
  }, [notificaciones, router]);

  function leer(id: string) {
    iniciar(async () => {
      const r = await marcarNotificacionLeida(id);
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  }

  function leerTodas() {
    iniciar(async () => {
      const r = await marcarTodasLeidas();
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative hover:bg-tinte"
          aria-label={n ? `${n} notificaciones sin leer` : "Notificaciones"}
        >
          <Bell className="size-5" />
          {n > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10.5px] font-semibold text-white">
              {n > 9 ? "9+" : n}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificaciones</span>
          {n > 0 && (
            <button
              type="button"
              onClick={leerTodas}
              disabled={pendiente}
              className="flex items-center gap-1 text-xs font-normal text-primary hover:underline"
            >
              <CheckCheck className="size-3.5" /> Leer todas
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {n === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">Nada pendiente.</p>
        ) : (
          notificaciones.map((x) => (
            <DropdownMenuItem key={x.id} className="items-start gap-2" onSelect={(e) => e.preventDefault()}>
              <div className="min-w-0 flex-1">
                {x.enlace ? (
                  <Link href={x.enlace} className="block text-sm font-medium hover:underline">
                    {x.titulo}
                  </Link>
                ) : (
                  <span className="block text-sm font-medium">{x.titulo}</span>
                )}
                {x.cuerpo && <span className="block text-xs text-muted-foreground">{x.cuerpo}</span>}
                <span className="block text-[11px] text-muted-foreground">{formatearFechaHora(x.creado_en)}</span>
              </div>
              <button
                type="button"
                onClick={() => leer(x.id)}
                disabled={pendiente}
                aria-label="Marcar como leída"
                className="rounded-md p-1 text-muted-foreground hover:bg-tinte hover:text-primary"
              >
                <Check className="size-4" />
              </button>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
