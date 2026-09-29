import type { NivelAcceso, Perfil, RolGlobal } from "./supabase/tipos";

/**
 * Helpers de PRESENTACIÓN. Sirven para decidir qué botones mostrar, no
 * para autorizar: la autorización real vive en RLS (Postgres). Si alguno
 * de estos helpers se equivoca, lo peor que pasa es un botón que al
 * pulsarlo devuelve "no autorizado".
 */

export function puedeSubir(
  perfil: Pick<Perfil, "rol" | "activo"> | null | undefined,
): boolean {
  return (
    !!perfil &&
    perfil.activo &&
    (perfil.rol === "admin" || perfil.rol === "editor")
  );
}

/**
 * Responder PQR y administrar usuarios son cosas distintas: Luisa contesta
 * el buzon sin tocar cuentas ni auditoria. Por eso es una bandera propia y
 * no un rol, que la habria hecho administradora de todo de paso.
 */
export function gestionaBuzon(
  perfil: Pick<Perfil, "rol" | "activo" | "gestiona_buzon"> | null | undefined,
): boolean {
  return (
    !!perfil && perfil.activo && (perfil.rol === "admin" || perfil.gestiona_buzon)
  );
}

/**
 * Los tres niveles, de menor a mayor. El mismo orden que el enum
 * nivel_acceso en Postgres, porque uno se compara contra el otro.
 */
const ORDEN: readonly NivelAcceso[] = ["lectura", "descarga", "edicion", "total"];

/**
 * Hasta dónde deja llegar el rol global, por alto que sea el permiso de
 * área. Espeja el least() de public.nivel_en_area(): un lector puede tener
 * concedida la edición en un área y aun así no pasará de descarga.
 */
const TECHO: Record<RolGlobal, NivelAcceso> = {
  admin: "total",
  editor: "total",
  lector: "descarga",
};

/**
 * Replica la lógica de public.nivel_en_area() para mostrar el nivel
 * efectivo en pantalla: el rol global es el techo.
 */
export function nivelEfectivo(
  rol: RolGlobal,
  activo: boolean,
  permiso: NivelAcceso | null | undefined,
): NivelAcceso | null {
  if (!activo) return null;
  if (rol === "admin") return "total";
  if (!permiso) return null;
  const techo = TECHO[rol];
  return ORDEN.indexOf(permiso) <= ORDEN.indexOf(techo) ? permiso : techo;
}

/**
 * Si el archivo se le puede entregar como descarga.
 *
 * Conviene tener claro su alcance: quita el botón y hace que la ruta de
 * descarga responda 403, pero quien puede abrir un PDF en el navegador
 * puede guardarlo desde el visor. "Vista" es un control administrativo
 * -deja constancia de quién se llevó qué- no una imposibilidad técnica.
 */
export function puedeDescargar(nivel: NivelAcceso | null | undefined): boolean {
  return nivel === "descarga" || nivel === "edicion";
}

export const ETIQUETA_ROL: Record<RolGlobal, string> = {
  admin: "Administrador",
  editor: "Editor",
  lector: "Lector",
};

export const DESCRIPCION_ROL: Record<RolGlobal, string> = {
  admin: "Administra usuarios, áreas y permisos. Ve todo y la auditoría.",
  editor: "Sube, edita y, si se le concede Total, elimina en las áreas asignadas.",
  lector: "No pasa de descarga, únicamente en las áreas asignadas.",
};

export const ETIQUETA_NIVEL: Record<NivelAcceso, string> = {
  lectura: "Vista",
  descarga: "Descarga",
  edicion: "Edición",
  total: "Total",
};

/** Sube documentos nuevos y modifica los que ya están. */
export function puedeEditarArea(nivel: NivelAcceso | null | undefined): boolean {
  return nivel === "edicion" || nivel === "total";
}

/**
 * Elimina documentos del área. Es el único nivel que destruye algo, por eso
 * va aparte aunque sea el último peldaño: quien lea el código tiene que ver
 * cuándo se está concediendo eso y no deducirlo de una comparación.
 */
export function puedeEliminarArea(nivel: NivelAcceso | null | undefined): boolean {
  return nivel === "total";
}
