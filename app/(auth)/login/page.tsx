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
      {/* Panel de marca. El archivo original es un rectangulo apaisado: al
          estirarlo para cubrir una columna vertical el logotipo se recortaba
          por los lados. Ahora el campo de lunares se dibuja con CSS -encaja en
          cualquier tamano y no pesa nada- y el logotipo va encima, entero. */}
      <div
        className="relative flex flex-col justify-end overflow-hidden p-6 sm:p-10 lg:p-12"
        style={{
          backgroundColor: "#b1e9fe",
          backgroundImage: [
            "radial-gradient(circle at center, #fff 12px, transparent 12.5px)",
            "radial-gradient(circle at center, #fff 12px, transparent 12.5px)",
          ].join(", "),
          backgroundSize: "104px 102px",
          backgroundPosition: "0 0, 52px 51px",
        }}
      >
        {/* Velo inferior: da contraste al titulo sin oscurecer el logotipo. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(13,43,78,0) 45%, rgba(13,43,78,0.88))",
          }}
        />

        {/* Solo en pantalla ancha: en el movil esta franja mide 200 px y el
            logotipo ya aparece justo debajo, sobre el formulario. */}
        <div className="relative hidden flex-1 items-center justify-center pb-12 lg:flex">
          <Image
            src="/marca/voz-marca.png"
            alt=""
            width={1519}
            height={545}
            priority
            sizes="420px"
            className="h-auto w-full max-w-[420px]"
          />
        </div>

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
