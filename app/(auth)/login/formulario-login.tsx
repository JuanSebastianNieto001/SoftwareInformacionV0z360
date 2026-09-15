"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { iniciarSesion, type EstadoFormulario } from "@/app/acciones/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputContrasena } from "@/components/ui/input-contrasena";
import { Label } from "@/components/ui/label";

const inicial: EstadoFormulario = { error: null };

export function FormularioLogin({
  volver,
  aviso,
}: {
  volver: string;
  aviso: string | null;
}) {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, inicial);

  return (
    <form action={accion} className="mt-7 space-y-4" noValidate>
      <input type="hidden" name="volver" value={volver} />

      {(aviso || estado.error) && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{estado.error ?? aviso}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">Correo</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="nombre@empresa.com"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <InputContrasena
          id="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </div>

      <Button type="submit" className="mt-2 h-[50px] w-full" size="lg" disabled={pendiente}>
        {pendiente && <Loader2 className="animate-spin" aria-hidden />}
        {pendiente ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
