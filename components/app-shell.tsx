"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  FolderOpen,
  KeyRound,
  LogOut,
  Menu,
  Shield,
  Upload,
  Users,
  ClipboardList,
  Inbox,
  MessageSquareText,
  Layers,
  KeySquare,
  Files,
} from "lucide-react";
import { cerrarSesion } from "@/app/acciones/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { iniciales } from "@/lib/formato";
import { ETIQUETA_ROL } from "@/lib/permisos";
import type { RolGlobal } from "@/lib/supabase/tipos";

type Item = { href: string; etiqueta: string; icono: typeof FolderOpen; exacto?: boolean };

const PRINCIPALES: Item[] = [
  { href: "/", etiqueta: "Mis áreas", icono: FolderOpen, exacto: true },
];

const SUBIR: Item = { href: "/subir", etiqueta: "Subir documento", icono: Upload };

// El buzon significa cosas distintas segun quien mira: para el personal es
// donde se envia un PQR, y para el admin donde se revisan los recibidos. El
// formulario de envio le sigue quedando a mano en la tarjeta del inicio.
const BUZON: Item = { href: "/buzon", etiqueta: "Buzón", icono: MessageSquareText };
const BUZON_GESTION: Item = { href: "/buzon/gestion", etiqueta: "Buzón", icono: Inbox };

export const ITEMS_ADMIN: Item[] = [
  { href: "/admin/documentos", etiqueta: "Documentos", icono: Files },
  { href: "/admin/usuarios", etiqueta: "Usuarios", icono: Users },
  { href: "/admin/areas", etiqueta: "Áreas", icono: Layers },
  { href: "/admin/permisos", etiqueta: "Permisos", icono: KeySquare },
  { href: "/admin/auditoria", etiqueta: "Auditoría", icono: ClipboardList },
];

export type PerfilShell = {
  nombre: string;
  rol: RolGlobal;
  cargo: string | null;
  gestiona_buzon: boolean;
};

export function AppShell({
  perfil,
  email,
  children,
}: {
  perfil: PerfilShell;
  email: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);

  const esAdmin = perfil.rol === "admin";
  const puedeSubir = esAdmin || perfil.rol === "editor";
  // Quien gestiona el buzon ve la bandeja; el resto, el formulario de envio.
  const gestorBuzon = esAdmin || perfil.gestiona_buzon;

  const items: Item[] = [
    ...PRINCIPALES,
    gestorBuzon ? BUZON_GESTION : BUZON,
    ...(puedeSubir ? [SUBIR] : []),
  ];

  const activo = (item: Item) =>
    item.exacto ? pathname === item.href : pathname.startsWith(item.href);

  const enAdmin = pathname.startsWith("/admin");

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] w-full max-w-[1120px] items-center gap-2 px-4 sm:px-6">
          {/* Menú móvil */}
          <Sheet open={abierto} onOpenChange={setAbierto}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menú">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b px-4 py-3 text-left">
                <SheetTitle className="text-base">Comunícate con VOZ360</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-0.5 p-2" aria-label="Principal">
                {items.map((item) => (
                  <EnlaceNav key={item.href} item={item} activo={activo(item)} onClick={() => setAbierto(false)} />
                ))}
                {esAdmin && (
                  <>
                    <Separator className="my-2" />
                    <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Administración
                    </p>
                    {ITEMS_ADMIN.map((item) => (
                      <EnlaceNav key={item.href} item={item} activo={activo(item)} onClick={() => setAbierto(false)} />
                    ))}
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>

          <Link href="/" className="shrink-0">
            {/* El nombre va en texto solo para lectores de pantalla: en
                pantalla lo dice el logotipo. */}
            <span className="sr-only">Comunícate con VOZ360</span>
            <Image
              src="/marca/voz-logo.png"
              alt=""
              width={95}
              height={38}
              priority
              className="h-[38px] w-auto rounded-[10px]"
            />
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Principal">
            {items.map((item) => (
              <Pastilla key={item.href} href={item.href} activo={activo(item)} icono={item.icono}>
                {item.etiqueta}
              </Pastilla>
            ))}
            {esAdmin && (
              <Pastilla href="/admin/documentos" activo={enAdmin} icono={Shield}>
                Administración
              </Pastilla>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-auto gap-2.5 px-1.5 py-1 hover:bg-tinte"
                  aria-label="Menú de usuario"
                >
                  <span className="hidden max-w-40 truncate text-right leading-tight sm:block">
                    <span className="block text-[13px] font-medium">{perfil.nombre || email}</span>
                    <span className="block text-[11px] text-muted-foreground">{ETIQUETA_ROL[perfil.rol]}</span>
                  </span>
                  <span
                    className="flex size-10 items-center justify-center rounded-full text-[13px] font-semibold text-white"
                    style={{ background: "linear-gradient(135deg, #1a7fe0, #0d2b4e)" }}
                  >
                    {iniciales(perfil.nombre || email) || "U"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <span className="block truncate text-sm font-medium">{perfil.nombre || "Sin nombre"}</span>
                  <span className="block truncate text-xs text-muted-foreground">{email}</span>
                  {perfil.cargo && (
                    <span className="block truncate text-xs text-muted-foreground">{perfil.cargo}</span>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/cambiar-contrasena">
                    <KeyRound /> Cambiar contraseña
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    void cerrarSesion();
                  }}
                >
                  <LogOut /> Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-7 pb-14 sm:px-6 sm:pt-9">{children}</main>
    </div>
  );
}

function Pastilla({
  href,
  activo,
  icono: Icono,
  children,
}: {
  href: string;
  activo: boolean;
  icono: typeof FolderOpen;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-[38px] items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium transition-colors",
        activo
          ? "bg-marino text-white"
          : "text-nav-inactivo hover:bg-tinte hover:text-marino",
      )}
    >
      <Icono className="size-4" aria-hidden />
      {children}
    </Link>
  );
}

function EnlaceNav({
  item,
  activo,
  onClick,
}: {
  item: Item;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors",
        activo ? "bg-marino font-medium text-white" : "text-nav-inactivo hover:bg-tinte",
      )}
    >
      <item.icono className="size-4" aria-hidden />
      {item.etiqueta}
    </Link>
  );
}

/** Pestañas secundarias del panel de administración. */
export function NavAdmin() {
  const pathname = usePathname();
  return (
    <nav
      className="mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl border-[1.5px] bg-card p-[5px]"
      aria-label="Administración"
    >
      {ITEMS_ADMIN.map((item) => {
        const activo = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex h-[38px] shrink-0 items-center gap-1.5 rounded-[11px] px-3.5 text-[13.5px] transition-colors",
              activo
                ? "bg-marino font-medium text-white"
                : "text-nav-inactivo hover:bg-tinte hover:text-marino",
            )}
          >
            <item.icono className="size-4" aria-hidden />
            {item.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
