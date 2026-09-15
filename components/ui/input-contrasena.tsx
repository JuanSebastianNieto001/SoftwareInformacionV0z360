"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Campo de contraseña con botón para mostrarla u ocultarla.
 *
 * El botón queda fuera del orden de tabulación (`tabIndex={-1}`): quien escribe
 * con teclado pasa del campo al siguiente sin tropezarlo, y quien necesita
 * revisar lo que tecleó lo alcanza con el ratón. Cada campo lleva su propio
 * estado y empieza oculto, de modo que revelar la contraseña no revela la
 * confirmación.
 */
function InputContrasena({
  className,
  disabled,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false);
  const Icono = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        {...props}
        disabled={disabled}
        type={visible ? "text" : "password"}
        className={cn("pr-9", className)}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
      >
        <Icono className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export { InputContrasena };
