"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  FileText,
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
  { href: "/buzon", etiqueta: "Buzón", icono: MessageSquareText },
];

const SUBIR: Item = { href: "/subir", etiqueta: "Subir documento", icono: Upload };

export const ITEMS_ADMIN: Item[] = [
  { href: "/admin/documentos", etiqueta: "Documentos", icono: Files },
  { href: "/admin/usuarios", etiqueta: "Usuarios", icono: Users },
  { href: "/admin/areas", etiqueta: "Áreas", icono: Layers },
  { href: "/admin/permisos", etiqueta: "Permisos", icono: KeySquare },
  { href: "/admin/buzon", etiqueta: "Buzón", icono: Inbox },
  { href: "/admin/auditoria", etiqueta: "Auditoría", icono: ClipboardList },
];

export type PerfilShell = {
  nombre: string;
  rol: RolGlobal;
  cargo: string | null;
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

  const items: Item[] = [...PRINCIPALES, ...(puedeSubir ? [SUBIR] : [])];

  const activo = (item: Item) =>
    item.exacto ? pathname === item.href : pathname.startsWith(item.href);

  const enAdmin = pathname.startsWith("/admin");

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-3 sm:px-4">
          {/* Menú móvil */}
          <Sheet open={abierto} onOpenChange={setAbierto}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menú">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b px-4 py-3 text-left">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <FileText className="size-4" /> Gestor Documental
                </SheetTitle>
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

          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FileText className="size-4" aria-hidden />
            </span>
            <span className="hidden sm:inline">Gestor Documental</span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Principal">
            {items.map((item) => (
              <Button
                key={item.href}
                variant={activo(item) ? "secondary" : "ghost"}
                size="sm"
                asChild
              >
                <Link href={item.href}>
                  <item.icono /> {item.etiqueta}
                </Link>
              </Button>
            ))}
            {esAdmin && (
              <Button variant={enAdmin ? "secondary" : "ghost"} size="sm" asChild>
                <Link href="/admin/documentos">
                  <Shield /> Administración
                </Link>
              </Button>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 px-2" aria-label="Menú de usuario">
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {iniciales(perfil.nombre || email) || "U"}
                  </span>
                  <span className="hidden max-w-40 truncate text-left leading-tight sm:block">
                    <span className="block text-sm">{perfil.nombre || email}</span>
                    <span className="block text-[11px] text-muted-foreground">{ETIQUETA_ROL[perfil.rol]}</span>
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

      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-5 sm:px-4 sm:py-6">{children}</main>
    </div>
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
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
        activo ? "bg-secondary font-medium" : "hover:bg-muted",
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
      className="-mx-3 mb-5 flex gap-1 overflow-x-auto border-b px-3 pb-px sm:mx-0 sm:px-0"
      aria-label="Administración"
    >
      {ITEMS_ADMIN.map((item) => {
        const activo = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
              activo
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
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
