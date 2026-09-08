import type { Metadata } from "next";
import { FileText } from "lucide-react";
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
    <main className="flex min-h-svh flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileText className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Gestor Documental</h1>
            <p className="text-sm text-muted-foreground">Acceso interno</p>
          </div>
        </div>

        <FormularioLogin volver={volver} aviso={aviso} />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          El registro es cerrado. Si no tienes usuario o lo olvidaste, pide
          ayuda al administrador.
        </p>
      </div>
    </main>
  );
}
