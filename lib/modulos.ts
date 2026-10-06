import { BadgeCheck, Cake, ClipboardCheck, type LucideIcon } from "lucide-react";

/**
 * Los cuadros que no son carpetas de documentos. Un área con
 * `areas.modulo` igual a una de estas claves abre su propia pantalla en
 * lugar de listar documentos. El acceso se decide igual que para cualquier
 * cuadro (nivel_en_area); aquí solo se dice a dónde lleva y cómo se pinta.
 */
export const MODULOS = {
  evaluacion: {
    href: "/evaluacion",
    icono: ClipboardCheck,
    pie: "Módulo de evaluación 360°",
  },
  cumpleanos: {
    href: "/cumpleanos",
    icono: Cake,
    pie: "Cumpleaños y alertas",
  },
  calidad: {
    href: "/calidad",
    icono: BadgeCheck,
    pie: "Auditorías, feedback y compromisos",
  },
} as const satisfies Record<string, { href: string; icono: LucideIcon; pie: string }>;

export type Modulo = keyof typeof MODULOS;

export function esModulo(valor: string | null | undefined): valor is Modulo {
  return !!valor && valor in MODULOS;
}
