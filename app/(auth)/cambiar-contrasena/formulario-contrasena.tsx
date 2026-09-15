"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { cambiarContrasena, cerrarSesion, type EstadoFormulario } from "@/app/acciones/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputContrasena } from "@/components/ui/input-contrasena";
import { Label } from "@/components/ui/label";

const inicial: EstadoFormulario = { error: null };

export function FormularioContrasena({ obligatorio }: { obligatorio: boolean }) {
  const [estado, accion, pendiente] = useActionState(cambiarContrasena, inicial);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{obligatorio ? "Define tu contraseña" : "Nueva contraseña"}</CardTitle>
        <CardDescription>
          {obligatorio
            ? "Es tu primer ingreso (o el administrador restableció tu clave). Elige una contraseña propia para continuar."
            : "Mínimo 8 caracteres. Al guardar seguirás con la sesión abierta."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={accion} className="space-y-4" noValidate>
          {estado.error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{estado.error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="password">Nueva contraseña</Label>
            <InputContrasena
              id="password"
              name="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmacion">Repite la contraseña</Label>
            <InputContrasena
              id="confirmacion"
              name="confirmacion"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={pendiente}>
            {pendiente && <Loader2 className="animate-spin" aria-hidden />}
            {pendiente ? "Guardando…" : "Guardar contraseña"}
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          {obligatorio ? (
            <span className="text-muted-foreground">Debes cambiarla para entrar.</span>
          ) : (
            <Button variant="link" size="sm" className="px-0" asChild>
              <Link href="/">Volver</Link>
            </Button>
          )}
          <form action={cerrarSesion}>
            <Button variant="link" size="sm" className="px-0 text-muted-foreground" type="submit">
              Cerrar sesión
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
