import type { Metadata } from "next";
import Image from "next/image";
import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = { title: "Iniciar sesión" };

const MENSAJES: Record<string, string> = {
  inactivo:
    "Tu usuario está desactivado o no tiene perfil. Comunícate con el administrador.",
  sesion: "Tu sesión terminó. Vuelve a iniciar sesión.",
};

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const volver = typeof params.volver === "string" ? params.volver : "/";
  const motivo = typeof params.motivo === "string" ? params.motivo : null;
  const aviso = motivo ? MENSAJES[motivo] ?? null : null;

  return (
    <main className="grid min-h-svh grid-rows-[200px_1fr] bg-card lg:grid-cols-[1.1fr_1fr] lg:grid-rows-1">
      {/* Panel de marca. En móvil se encoge a una franja superior: la imagen
          ambienta, pero el formulario es lo que se viene a hacer. */}
      <div className="relative flex items-end overflow-hidden p-6 sm:p-10 lg:p-12">
        <Image
          src="/marca/voz-fondo.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 55vw, 100vw"
          className="object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(13,43,78,0) 30%, rgba(13,43,78,0.85))",
          }}
        />
        {/* El nombre del canal manda: va en grande y el lema debajo lo
            acompaña. Al revés se leía primero la frase y el nombre pasaba
            por encabezado de sección. */}
        <div className="relative max-w-[460px] text-white">
          <p className="text-[30px] leading-[1.08] font-semibold tracking-[-0.02em] sm:text-[46px]">
            Comunícate con VOZ360
          </p>
          <p className="mt-3 text-[15px] leading-snug text-white/80 sm:text-base">
            Conecta con soluciones. Tus documentos, siempre vigentes.
          </p>
        </div>
      </div>

      {/* Panel de acceso */}
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <Image
            src="/marca/voz-logo.png"
            alt=""
            width={140}
            height={56}
            priority
            className="h-14 w-auto rounded-[14px]"
          />

          <h1 className="mt-7 text-[26px] leading-tight font-semibold tracking-[-0.02em]">
            Iniciar sesión
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Usa el correo y la contraseña que te asignaron.
          </p>

          <FormularioLogin volver={volver} aviso={aviso} />

          <p className="mt-6 text-xs text-atenuado">
            El registro es cerrado. Si no tienes usuario o lo olvidaste, pide
            ayuda al administrador.
          </p>
        </div>
      </div>
    </main>
  );
}
