"use client";

// Marco de la aplicación: cabecera con la navegación que corresponde al rol,
// campana de notificaciones y menú de usuario; en móvil, panel lateral.
//
// La cabecera es una franja de vidrio con burbujas de color que flotan
// despacio detrás (decorativas, aria-hidden, solo con motion-safe:). Todo lo
// que se toca —navegación, campana, usuario— es una píldora: la de la
// sección actual va rellena en marino. Para que la navegación quepa en una
// sola línea a 1280–1366 px, lo propio de cada persona se agrupa en el
// desplegable «Lo mío», y por debajo de xl los ítems secundarios muestran
// solo su ícono (con aria-label y title).
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  FolderOpen,
  KeyRound,
  LogOut,
  Menu,
  Shield,
  Upload,
  Users,
  Users2,
  ClipboardList,
  Inbox,
  MessageSquareText,
  Layers,
  KeySquare,
  Files,
  BadgeCheck,
  MessageSquareHeart,
  Trophy,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { cerrarSesion } from "@/app/acciones/auth";
import { CampanaNotificaciones, type NotificacionShell } from "@/components/comunes/campana-notificaciones";
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

type Item = {
  href: string;
  etiqueta: string;
  icono: typeof FolderOpen;
  exacto?: boolean;
  /** Una línea de ayuda bajo la etiqueta en el desplegable «Lo mío». */
  descripcion?: string;
};

const PRINCIPALES: Item[] = [
  { href: "/", etiqueta: "Mis áreas", icono: FolderOpen, exacto: true },
];

const SUBIR: Item = { href: "/subir", etiqueta: "Subir documento", icono: Upload };

// El buzon significa cosas distintas segun quien mira: para el personal es
// donde se envia un PQR, y para el admin donde se revisan los recibidos. El
// formulario de envio le sigue quedando a mano en la tarjeta del inicio.
const BUZON: Item = { href: "/buzon", etiqueta: "Buzón", icono: MessageSquareText };
const BUZON_GESTION: Item = { href: "/buzon/gestion", etiqueta: "Buzón", icono: Inbox };

// Lo propio de cada persona, visible para todos: sus auditorías de calidad
// (con su firma) y el feedback que le han hecho. RLS entrega solo lo suyo.
const LO_MIO: Item[] = [
  {
    href: "/mis-evaluaciones",
    etiqueta: "Mis evaluaciones",
    icono: BadgeCheck,
    descripcion: "Tus auditorías de calidad y su firma",
  },
  {
    href: "/mis-feedback",
    etiqueta: "Mis feedback",
    icono: MessageSquareHeart,
    descripcion: "La retroalimentación que te han hecho",
  },
  // Público para todo el personal: el ranking de calidad del mes en curso.
  { href: "/ranking", etiqueta: "Ranking", icono: Trophy, descripcion: "La calidad del mes en curso" },
];

const ITEMS_ADMIN: Item[] = [
  { href: "/admin/documentos", etiqueta: "Documentos", icono: Files },
  { href: "/admin/usuarios", etiqueta: "Usuarios", icono: Users },
  { href: "/admin/areas", etiqueta: "Áreas", icono: Layers },
  { href: "/admin/grupos", etiqueta: "Grupos", icono: Users2 },
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
  notificaciones,
  children,
}: {
  perfil: PerfilShell;
  email: string;
  notificaciones: NotificacionShell[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);

  const esAdmin = perfil.rol === "admin";
  const puedeSubir = esAdmin || perfil.rol === "editor";
  // Quien gestiona el buzon ve la bandeja; el resto, el formulario de envio.
  const gestorBuzon = esAdmin || perfil.gestiona_buzon;

  const buzon = gestorBuzon ? BUZON_GESTION : BUZON;
  // En el panel móvil va todo, uno debajo del otro, «Lo mío» incluido.
  const items: Item[] = [
    ...PRINCIPALES,
    ...LO_MIO,
    buzon,
    ...(puedeSubir ? [SUBIR] : []),
  ];
  // En la cabecera, «Lo mío» va en su desplegable y estos quedan sueltos.
  const secundarios: Item[] = [buzon, ...(puedeSubir ? [SUBIR] : [])];

  const activo = (item: Item) =>
    item.exacto ? pathname === item.href : pathname.startsWith(item.href);

  const enAdmin = pathname.startsWith("/admin");

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 bg-card/80 shadow-[0_12px_30px_-26px_rgb(13_43_78/0.55)] backdrop-blur-xl">
        <BurbujasCabecera />
        <div className="relative mx-auto flex h-[68px] w-full max-w-[1120px] items-center gap-2 px-4 sm:px-6">
          {/* Menú móvil */}
          <Sheet open={abierto} onOpenChange={setAbierto}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  VIDRIO,
                  "size-10 rounded-full text-marino hover:bg-tinte hover:text-marino aria-expanded:bg-tinte md:hidden",
                )}
                aria-label="Abrir menú"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="relative overflow-hidden border-b px-4 py-4 text-left">
                <span
                  aria-hidden
                  className="pointer-events-none absolute -top-12 -right-6 size-32 rounded-full bg-primary/20 blur-2xl"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute -bottom-14 left-6 size-28 rounded-full bg-[#ffc48a]/30 blur-2xl"
                />
                <SheetTitle className="relative text-base">Comunícate con VOZ360</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pt-1 pb-4" aria-label="Principal">
                {items.map((item) => (
                  <EnlaceNav key={item.href} item={item} activo={activo(item)} onClick={() => setAbierto(false)} />
                ))}
                {esAdmin && (
                  <>
                    <Separator className="my-2" />
                    <p className="px-4 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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

          <Link
            href="/"
            className="shrink-0 rounded-[12px] transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-safe:hover:-translate-y-px"
          >
            {/* El nombre va en texto solo para lectores de pantalla: en
                pantalla lo dice el logotipo. */}
            <span className="sr-only">Comunícate con VOZ360</span>
            <Image
              src="/marca/voz-logo.png"
              alt=""
              width={95}
              height={38}
              priority
              className="h-[38px] w-auto rounded-[10px] shadow-[0_6px_16px_-10px_rgb(13_43_78/0.6)]"
            />
          </Link>

          {/* Una sola línea: la cápsula no se encoge y sus píldoras no parten
              el texto; lo que cede, si falta sitio, es el nombre del usuario. */}
          <nav
            className={cn(VIDRIO, "ml-3 hidden shrink-0 items-center gap-0.5 rounded-full p-1 md:flex")}
            aria-label="Principal"
          >
            {PRINCIPALES.map((item) => (
              <Pastilla key={item.href} href={item.href} activo={activo(item)} icono={item.icono}>
                {item.etiqueta}
              </Pastilla>
            ))}
            <MenuLoMio esActivo={activo} />
            {secundarios.map((item) => (
              <Pastilla key={item.href} href={item.href} activo={activo(item)} icono={item.icono} compacta>
                {item.etiqueta}
              </Pastilla>
            ))}
            {esAdmin && (
              <>
                <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-borde-acento" />
                <Pastilla href="/admin/documentos" activo={enAdmin} icono={Shield} compacta>
                  Administración
                </Pastilla>
              </>
            )}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            {/* La campana vive en su propio componente; aquí solo se le da la
                forma de burbuja a su botón. */}
            <div className={cn(VIDRIO, "shrink-0 rounded-full [&>button]:size-10 [&>button]:rounded-full")}>
              <CampanaNotificaciones notificaciones={notificaciones} />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    VIDRIO,
                    "h-11 min-w-0 shrink gap-2.5 rounded-full p-1 hover:bg-tinte aria-expanded:bg-tinte sm:pl-3.5 md:pl-1 lg:pl-3.5",
                  )}
                  aria-label="Menú de usuario"
                >
                  <span className="hidden min-w-0 max-w-40 text-right leading-tight sm:block md:hidden lg:block">
                    <span className="block truncate text-[13px] font-medium text-marino">{perfil.nombre || email}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{ETIQUETA_ROL[perfil.rol]}</span>
                  </span>
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white shadow-[0_6px_14px_-6px_rgb(13_43_78/0.65)] ring-2 ring-white"
                    style={{ background: "linear-gradient(135deg, #1a7fe0, #0d2b4e)" }}
                  >
                    {iniciales(perfil.nombre || email) || "U"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={10} className="w-60 rounded-2xl p-1.5">
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

// ---------------------------------------------------------------------------
// Lenguaje de burbuja
// ---------------------------------------------------------------------------

/** Cápsula de vidrio sobre las burbujas: deja ver el color sin perder contraste. */
const VIDRIO =
  "bg-white/60 shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_6px_18px_-12px_rgb(13_43_78/0.35)] ring-1 ring-borde-acento/70 backdrop-blur-md";

/** Forma común de las píldoras de la cabecera: una línea, ícono y etiqueta. */
const PILDORA =
  "relative isolate flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * La sección actual: burbuja rellena en marino con un brillo arriba (por
 * detrás del texto) y una sombra suave. Blanco sobre marino pasa AA de
 * sobra; sobre el azul primario no lo pasaría, por eso no se usa aquí.
 */
const BURBUJA_ACTIVA =
  "bg-[linear-gradient(135deg,var(--marino-suave),var(--marino))] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_8px_18px_-8px_rgb(13_43_78/0.65)] before:pointer-events-none before:absolute before:inset-x-2 before:top-px before:-z-10 before:h-1/2 before:rounded-full before:bg-linear-to-b before:from-white/25 before:to-transparent motion-safe:animate-[inflar_0.45s_ease-out]";

/** El resto: texto sobrio que en hover se tiñe y sube un pelo. */
const BURBUJA_REPOSO = "text-nav-inactivo hover:bg-tinte hover:text-marino motion-safe:hover:-translate-y-px";

/**
 * Manchas de color difusas detrás de la cabecera: posición y tamaño, color,
 * recorrido (dx, dy) y ritmo. Fijas para que no cambien al recargar.
 */
const MANCHAS: { clase: string; dx: number; dy: number; dur: number; d: number }[] = [
  { clase: "-top-24 -left-12 size-56 bg-primary/25", dx: 42, dy: 12, dur: 19, d: 0 },
  { clase: "-top-10 left-[20%] size-36 bg-[#5cc2ff]/30", dx: -32, dy: 10, dur: 23, d: -6 },
  { clase: "-top-20 left-[44%] size-44 bg-marino-suave/15", dx: 36, dy: 14, dur: 21, d: -3 },
  // El toque cálido: un durazno muy tenue para que el azul no se vea frío.
  { clase: "-top-8 left-[64%] size-32 bg-[#ffc48a]/30", dx: -28, dy: 8, dur: 25, d: -11 },
  { clase: "-top-24 -right-14 size-60 bg-[#3fa3ff]/20", dx: -40, dy: 12, dur: 20, d: -8 },
];

/** Burbujitas que suben: posición horizontal, diámetro, ritmo, desfase y vaivén. */
const BURBUJAS: { x: string; s: number; dur: number; d: number; deriva: number }[] = [
  { x: "7%", s: 8, dur: 11, d: 0, deriva: 6 },
  { x: "18%", s: 5, dur: 9, d: -4, deriva: -5 },
  { x: "33%", s: 10, dur: 13, d: -7, deriva: 8 },
  { x: "51%", s: 6, dur: 10, d: -2, deriva: -6 },
  { x: "62%", s: 9, dur: 12, d: -9, deriva: 7 },
  { x: "77%", s: 5, dur: 9.5, d: -5, deriva: -4 },
  { x: "90%", s: 8, dur: 12.5, d: -1, deriva: 5 },
];

/**
 * Fondo animado de la cabecera. Decorativo: aria-hidden y sin eventos.
 * Con «reducir movimiento» las manchas se quedan quietas y las burbujitas
 * no aparecen (parten de opacidad 0 y solo la animación las muestra).
 */
function BurbujasCabecera() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {MANCHAS.map((m, i) => (
        <span
          key={i}
          className={cn(
            "absolute rounded-full blur-2xl will-change-transform motion-safe:animate-[burbujear_20s_ease-in-out_infinite]",
            m.clase,
          )}
          style={
            {
              animationDuration: `${m.dur}s`,
              animationDelay: `${m.d}s`,
              "--dx": `${m.dx}px`,
              "--dy": `${m.dy}px`,
            } as CSSProperties
          }
        />
      ))}
      {/* Velo: suaviza el color para que el texto conserve el contraste. */}
      <div className="absolute inset-0 bg-linear-to-b from-white/35 via-white/10 to-white/30" />
      {BURBUJAS.map((b, i) => (
        <span
          key={i}
          className="absolute -bottom-3 rounded-full bg-[radial-gradient(circle_at_32%_30%,rgb(255_255_255/0.95),rgb(255_255_255/0.25)_45%,rgb(26_127_224/0.2)_100%)] opacity-0 ring-1 ring-primary/25 motion-safe:animate-[ascender_11s_linear_infinite]"
          style={
            {
              left: b.x,
              width: b.s,
              height: b.s,
              animationDuration: `${b.dur}s`,
              animationDelay: `${b.d}s`,
              "--deriva": `${b.deriva}px`,
            } as CSSProperties
          }
        />
      ))}
      {/* Filo inferior: una línea de luz en lugar de un borde plano. */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-borde-acento to-transparent" />
    </div>
  );
}

function Pastilla({
  href,
  activo,
  icono: Icono,
  compacta = false,
  children,
}: {
  href: string;
  activo: boolean;
  icono: typeof FolderOpen;
  /** Por debajo de xl muestra solo el ícono; la etiqueta queda en aria-label y title. */
  compacta?: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      aria-label={compacta ? children : undefined}
      title={compacta ? children : undefined}
      className={cn(PILDORA, activo ? BURBUJA_ACTIVA : BURBUJA_REPOSO, compacta && "px-2.5 xl:px-3")}
    >
      <Icono className="size-4 shrink-0" aria-hidden />
      <span className={cn(compacta && "hidden xl:inline")}>{children}</span>
    </Link>
  );
}

/**
 * «Lo mío»: evaluaciones, feedback y ranking en un desplegable. La píldora
 * se enciende si se está en cualquiera de las tres. Radix se encarga del
 * teclado: Enter, espacio o flecha abajo lo abren, las flechas recorren las
 * opciones y Escape lo cierra devolviendo el foco a la píldora.
 */
function MenuLoMio({ esActivo }: { esActivo: (item: Item) => boolean }) {
  const actual = LO_MIO.find(esActivo);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-current={actual ? "true" : undefined}
          className={cn(
            PILDORA,
            actual
              ? BURBUJA_ACTIVA
              : cn(BURBUJA_REPOSO, "data-[state=open]:bg-tinte data-[state=open]:text-marino"),
            "group/lomio pr-2.5",
          )}
        >
          <Sparkles className="size-4 shrink-0" aria-hidden />
          Lo mío
          {/* Quien usa lector de pantalla oye en cuál de las tres está. */}
          {actual && <span className="sr-only">, {actual.etiqueta}</span>}
          <ChevronDown
            className="size-3.5 shrink-0 opacity-75 transition-transform duration-200 group-data-[state=open]/lomio:rotate-180"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={10} className="w-72 rounded-2xl p-1.5 shadow-lg">
        <DropdownMenuLabel className="px-2 pt-1.5 pb-1 text-[11px] tracking-wide uppercase">Lo mío</DropdownMenuLabel>
        {LO_MIO.map((item) => {
          const esActual = esActivo(item);
          return (
            <DropdownMenuItem
              key={item.href}
              asChild
              className={cn("gap-3 rounded-xl px-2 py-2 focus:bg-tinte", esActual && "bg-tinte/70")}
            >
              <Link href={item.href} aria-current={esActual ? "page" : undefined}>
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-marino-suave shadow-sm",
                    esActual ? "ring-2 ring-primary/60" : "ring-1 ring-borde-acento/70",
                  )}
                >
                  <item.icono className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-marino">{item.etiqueta}</span>
                  {item.descripcion && (
                    <span className="block truncate text-xs text-muted-foreground">{item.descripcion}</span>
                  )}
                </span>
                {esActual && <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
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
      aria-current={activo ? "page" : undefined}
      className={cn(
        "relative isolate flex items-center gap-3 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-medium transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        activo ? BURBUJA_ACTIVA : "text-nav-inactivo hover:bg-tinte hover:text-marino",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          activo ? "bg-white/15" : "bg-white text-marino-suave ring-1 ring-borde-acento/70",
        )}
      >
        <item.icono className="size-4" aria-hidden />
      </span>
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
