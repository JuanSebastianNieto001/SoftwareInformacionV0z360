import { z } from "zod";

// ---------------------------------------------------------------------------
// Constantes compartidas entre cliente y servidor
// ---------------------------------------------------------------------------

/** 50 MB, igual al file_size_limit del bucket `documentos`. */
export const TAMANO_MAXIMO_BYTES = 50 * 1024 * 1024;

/** Debe coincidir con allowed_mime_types del bucket. */
export const MIME_PERMITIDOS = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export type MimePermitido = (typeof MIME_PERMITIDOS)[number];

export const EXTENSIONES_PERMITIDAS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".docx",
  ".xlsx",
  ".pptx",
] as const;

export const ETIQUETA_MIME: Record<MimePermitido, string> = {
  "application/pdf": "PDF",
  "image/png": "Imagen PNG",
  "image/jpeg": "Imagen JPG",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "PowerPoint",
};

export const ROLES = ["admin", "editor", "lector"] as const;
export const NIVELES = ["lectura", "edicion"] as const;
export const ESTADOS = ["vigente", "programado", "vencido", "purgado"] as const;
export const ACCIONES = [
  "listar",
  "abrir",
  "descargar",
  "subir",
  "editar",
  "eliminar",
  "login",
] as const;

// ---------------------------------------------------------------------------
// Piezas reutilizables
// ---------------------------------------------------------------------------

const uuid = z.uuid({ message: "Identificador inválido" });

const fechaIso = z.iso.datetime({
  offset: true,
  message: "Fecha inválida (se espera ISO 8601)",
});

const titulo = z
  .string()
  .trim()
  .min(3, "El título debe tener al menos 3 caracteres")
  .max(200, "El título no puede superar 200 caracteres");

const descripcion = z
  .string()
  .trim()
  .max(2000, "La descripción no puede superar 2000 caracteres")
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const etiquetas = z
  .array(z.string().trim().min(1).max(40))
  .max(10, "Máximo 10 etiquetas")
  .default([])
  .transform((arr) => Array.from(new Set(arr.map((e) => e.toLowerCase()))));

const mime = z.enum(MIME_PERMITIDOS, {
  message: "Tipo de archivo no permitido (PDF, imágenes, Word, Excel o PowerPoint)",
});

const tamanoBytes = z
  .number()
  .int()
  .nonnegative()
  .max(TAMANO_MAXIMO_BYTES, "El archivo no puede superar 50 MB");

const nombreArchivo = z
  .string()
  .trim()
  .min(1, "Nombre de archivo vacío")
  .max(180, "Nombre de archivo demasiado largo")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "El nombre de archivo contiene caracteres no permitidos",
  );

const email = z.email({ message: "Correo inválido" }).trim().toLowerCase();

const contrasena = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(72, "La contraseña es demasiado larga");

/** Regla común: vigente_hasta (si existe) debe ser posterior a vigente_desde. */
function vigenciaCoherente(
  datos: { vigente_desde: string; vigente_hasta: string | null },
  ctx: z.RefinementCtx,
) {
  if (
    datos.vigente_hasta &&
    new Date(datos.vigente_hasta).getTime() <=
      new Date(datos.vigente_desde).getTime()
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["vigente_hasta"],
      message: "La fecha de vencimiento debe ser posterior a la fecha de inicio",
    });
  }
}

// ---------------------------------------------------------------------------
// Autenticación
// ---------------------------------------------------------------------------

export const esquemaLogin = z.object({
  email,
  password: z.string().min(1, "Ingresa tu contraseña"),
});

export const esquemaCambioContrasena = z
  .object({
    password: contrasena,
    confirmacion: z.string(),
  })
  .refine((d) => d.password === d.confirmacion, {
    path: ["confirmacion"],
    message: "Las contraseñas no coinciden",
  });

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

/** Cuerpo de POST /api/documentos/subir (el archivo ya está en Storage). */
export const esquemaSubida = z
  .object({
    id: uuid,
    area_id: uuid,
    titulo,
    descripcion,
    etiquetas,
    nombre_archivo: nombreArchivo,
    mime,
    tamano_bytes: tamanoBytes,
    vigente_desde: fechaIso,
    vigente_hasta: fechaIso.nullable(),
  })
  .superRefine(vigenciaCoherente);

export type DatosSubida = z.infer<typeof esquemaSubida>;

/** Cuerpo de PATCH /api/documentos/[id] (solo metadatos). */
export const esquemaEdicionDocumento = z
  .object({
    titulo,
    descripcion,
    etiquetas,
    vigente_desde: fechaIso,
    vigente_hasta: fechaIso.nullable(),
  })
  .superRefine(vigenciaCoherente);

export type DatosEdicionDocumento = z.infer<typeof esquemaEdicionDocumento>;

/** Cuerpo de POST /api/documentos/[id]/reemplazar (archivo nuevo ya subido). */
export const esquemaReemplazo = z.object({
  nombre_archivo: nombreArchivo,
  mime,
  tamano_bytes: tamanoBytes,
});

export type DatosReemplazo = z.infer<typeof esquemaReemplazo>;

// ---------------------------------------------------------------------------
// Administración
// ---------------------------------------------------------------------------

export const esquemaArea = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(80, "El nombre no puede superar 80 caracteres"),
  descripcion: z
    .string()
    .trim()
    .max(500, "La descripción no puede superar 500 caracteres")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type DatosArea = z.infer<typeof esquemaArea>;

export const esquemaPermiso = z.object({
  usuario_id: uuid,
  area_id: uuid,
  /** null = quitar el acceso */
  nivel: z.enum(NIVELES).nullable(),
});

export type DatosPermiso = z.infer<typeof esquemaPermiso>;

export const esquemaUsuarioNuevo = z.object({
  email,
  password: contrasena,
  nombre: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(120),
  cargo: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  rol: z.enum(ROLES),
});

export type DatosUsuarioNuevo = z.infer<typeof esquemaUsuarioNuevo>;

export const esquemaUsuarioEdicion = z.object({
  id: uuid,
  nombre: z.string().trim().min(2).max(120).optional(),
  cargo: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
  rol: z.enum(ROLES).optional(),
  activo: z.boolean().optional(),
  /** Si viene, se restablece la contraseña y se exige cambiarla al entrar. */
  nueva_contrasena: contrasena.optional(),
});

export type DatosUsuarioEdicion = z.infer<typeof esquemaUsuarioEdicion>;

// ---------------------------------------------------------------------------
// Auditoría (filtros por query string)
// ---------------------------------------------------------------------------

export const esquemaFiltrosAuditoria = z.object({
  usuario: uuid.optional(),
  documento: uuid.optional(),
  accion: z.enum(ACCIONES).optional(),
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
  q: z.string().trim().max(120).optional(),
});

export type FiltrosAuditoria = z.infer<typeof esquemaFiltrosAuditoria>;

// ---------------------------------------------------------------------------
// Utilidad
// ---------------------------------------------------------------------------

/** Devuelve el primer mensaje de error legible de un ZodError. */
export function primerError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Datos inválidos";
  const ruta = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${ruta}${issue.message}`;
}
