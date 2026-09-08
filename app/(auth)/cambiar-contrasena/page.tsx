import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { sesionOpcional } from "@/lib/sesion";
import { FormularioContrasena } from "./formulario-contrasena";

export const metadata: Metadata = { title: "Cambiar contraseña" };

export default async function PaginaCambiarContrasena() {
  const { user } = await sesionOpcional();
  if (!user) redirect("/login");

  const obligatorio = user.user_metadata?.debe_cambiar_contrasena === true;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <KeyRound className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Cambiar contraseña</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <FormularioContrasena obligatorio={obligatorio} />
      </div>
    </main>
  );
}
