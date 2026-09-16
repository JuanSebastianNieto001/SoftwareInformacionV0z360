import type { EstadoSugerencia, TipoSugerencia } from "./supabase/tipos";

/**
 * Etiquetas y ayudas del buzón de sugerencias.
 *
 * Los textos de ayuda no son decoración: un registro ISO 9001 sirve de
 * evidencia solo si describe hechos comprobables. Pedir "qué pasó, dónde y
 * cuándo" en el propio formulario es más barato que devolver el caso.
 */

export const ETIQUETA_TIPO: Record<TipoSugerencia, string> = {
  sugerencia: "Sugerencia",
  queja: "Queja o reclamo",
  felicitacion: "Felicitación",
  no_conformidad: "No conformidad",
  oportunidad_mejora: "Oportunidad de mejora",
};

export const AYUDA_TIPO: Record<TipoSugerencia, string> = {
  sugerencia: "Una idea para hacer algo mejor, sin que nadie haya incumplido nada.",
  queja: "Algo que te afectó a ti o a un cliente y quieres que se revise.",
  felicitacion: "Un reconocimiento. También es retroalimentación y se registra igual.",
  no_conformidad: "Se incumplió un requisito, un procedimiento o un compromiso con el cliente.",
  oportunidad_mejora: "Un proceso funciona, pero detectaste que puede dar más.",
};

/**
 * Como se le pregunta a quien reporta, segun el tipo.
 *
 * El mismo campo de la base cambia de pregunta: "que ocurrio" en una queja es
 * "que quieres reconocer" en una felicitacion. Preguntar bien es lo que hace
 * que el registro sirva de evidencia sin tener que devolver el caso.
 *
 * Que campos aparecen no se decide aqui sino en CAMPOS_POR_TIPO
 * (lib/validaciones.ts), que es la misma tabla que usa el esquema.
 */
export const TEXTOS_TIPO: Record<
  TipoSugerencia,
  {
    descripcion: { etiqueta: string; ayuda: string };
    impacto: { etiqueta: string; ayuda: string };
    propuesta: { etiqueta: string; ayuda: string };
  }
> = {
  sugerencia: {
    descripcion: {
      etiqueta: "¿Qué observaste?",
      ayuda: "Qué se puede hacer mejor y en qué punto del proceso lo viste.",
    },
    impacto: { etiqueta: "¿A quién o a qué afecta?", ayuda: "" },
    propuesta: {
      etiqueta: "¿Qué propones?",
      ayuda: "La mejora concreta que sugieres.",
    },
  },
  queja: {
    descripcion: {
      etiqueta: "¿Qué ocurrió?",
      ayuda: "Hechos, no opiniones: qué pasó, en qué punto del proceso y quiénes intervinieron.",
    },
    impacto: {
      etiqueta: "¿A quién o a qué afecta?",
      ayuda: "Al cliente, al servicio, a un compañero, a un documento del sistema…",
    },
    propuesta: {
      etiqueta: "¿Cómo lo mejorarías? (opcional)",
      ayuda: "",
    },
  },
  felicitacion: {
    descripcion: {
      etiqueta: "¿Qué quieres reconocer?",
      ayuda: "A quién felicitas y qué hizo bien.",
    },
    impacto: { etiqueta: "¿A quién o a qué afecta?", ayuda: "" },
    propuesta: { etiqueta: "¿Cómo lo mejorarías? (opcional)", ayuda: "" },
  },
  no_conformidad: {
    descripcion: {
      etiqueta: "¿Qué requisito se incumplió?",
      ayuda: "Qué procedimiento, requisito o compromiso con el cliente no se cumplió, y dónde.",
    },
    impacto: {
      etiqueta: "¿A quién o a qué afecta?",
      ayuda: "Al cliente, al servicio, a un compañero, a un documento del sistema…",
    },
    propuesta: {
      etiqueta: "¿Cómo lo corregirías? (opcional)",
      ayuda: "",
    },
  },
  oportunidad_mejora: {
    descripcion: {
      etiqueta: "¿Qué proceso puede dar más?",
      ayuda: "Qué funciona hoy y dónde ves margen para que rinda mejor.",
    },
    impacto: { etiqueta: "¿A quién o a qué afecta?", ayuda: "" },
    propuesta: {
      etiqueta: "¿Qué propones?",
      ayuda: "La mejora concreta que sugieres.",
    },
  },
};

/**
 * Area o cargo de quien reporta. Se guardan claves y no etiquetas para poder
 * cambiar el texto mostrado sin reescribir los registros ya enviados.
 */
export const ETIQUETA_AREA_REPORTE: Record<string, string> = {
  team_leader: "Team leader",
  asesor: "Asesor",
  administrativo: "Administrativo",
  gerencia: "Gerencia",
};

/** Etiqueta legible, tolerando cualquier valor fuera de la lista. */
export function etiquetaArea(valor: string): string {
  return ETIQUETA_AREA_REPORTE[valor] ?? valor;
}

export const ETIQUETA_ESTADO: Record<EstadoSugerencia, string> = {
  recibida: "Sin gestionar",
  en_proceso: "En proceso",
  cerrada: "Cerrada",
  rechazada: "Rechazada",
};

type VarianteBadge = "default" | "secondary" | "destructive" | "outline";

export const VARIANTE_ESTADO: Record<EstadoSugerencia, VarianteBadge> = {
  recibida: "default",
  en_proceso: "secondary",
  cerrada: "outline",
  rechazada: "destructive",
};

/**
 * Radicado legible. Un caso se cita en auditoría por este número, no por su
 * UUID, así que se mantiene corto y con ceros a la izquierda para que ordene
 * bien en una hoja de cálculo.
 */
export function radicado(consecutivo: number): string {
  return `BZ-${String(consecutivo).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// Evidencia de la respuesta
// ---------------------------------------------------------------------------

/**
 * La prueba de que se contestó por correo. Se acepta imagen o PDF: un
 * pantallazo suele ser PNG o JPG, pero quien imprime el correo a PDF no
 * debería quedarse fuera por eso.
 */
export const MIME_EVIDENCIA = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const;

/** Debe coincidir con el file_size_limit del bucket `evidencias`. */
export const TAMANO_MAXIMO_EVIDENCIA = 10 * 1024 * 1024;

export const ACCEPT_EVIDENCIA = [".png", ".jpg", ".jpeg", ".webp", ".pdf", ...MIME_EVIDENCIA].join(
  ",",
);

/** Ruta en el bucket privado: <sugerencia_id>/<archivo>. */
export function rutaEvidencia(sugerenciaId: string, nombreArchivo: string): string {
  return `${sugerenciaId}/${nombreArchivo}`;
}

/** Devuelve el motivo del rechazo, o null si el archivo sirve. */
export function motivoRechazoEvidencia(archivo: File): string | null {
  if (archivo.size === 0) return "El archivo está vacío.";
  if (archivo.size > TAMANO_MAXIMO_EVIDENCIA) return "La evidencia supera el máximo de 10 MB.";
  if (!(MIME_EVIDENCIA as readonly string[]).includes(archivo.type)) {
    return "La evidencia debe ser una imagen (PNG, JPG, WEBP) o un PDF.";
  }
  return null;
}
