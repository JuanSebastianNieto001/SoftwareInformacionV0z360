import "server-only";

import { exigirModulo, type SesionModulo } from "./modulos-acceso";

export type SesionEvaluacion = SesionModulo;

/** Guardia de /evaluacion. Ver lib/modulos-acceso.ts. */
export function exigirModuloEvaluacion(): Promise<SesionEvaluacion> {
  return exigirModulo("evaluacion");
}
