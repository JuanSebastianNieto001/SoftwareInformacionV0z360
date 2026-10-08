"use client";

/**
 * Formulario de entrada: usuario (correo o número de Poliedro) y contraseña
 * con ver/ocultar.
 */
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

      {/*
        Dos formas de identificarse conviven aquí: los asesores escriben su
        número de Poliedro y el resto su correo. El esquema convierte el
        número en el correo interno, así que el campo no es type="email":
        con ese tipo el navegador tacharía el número como inválido.
      */}
      <div className="space-y-1.5">
        <Label htmlFor="email">Número de Poliedro o correo</Label>
        <Input
          id="email"
          name="email"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="Colocar número de Poliedro o correo"
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
