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

// `nullish` y no `optional`: el cliente valida con estos mismos esquemas y envia
// al servidor la salida ya transformada, donde el campo vacio es null. Si solo
// aceptara undefined, el segundo parseo rechazaria su propia salida.
const descripcion = z
  .string()
  .trim()
  .max(2000, "La descripción no puede superar 2000 caracteres")
  .nullish()
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
    .nullish()
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
    .nullish()
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
// Buzón de sugerencias (ISO 9001:2015)
// ---------------------------------------------------------------------------

export const TIPOS_SUGERENCIA = [
  "sugerencia",
  "queja",
  "felicitacion",
  "no_conformidad",
  "oportunidad_mejora",
] as const;

/**
 * Area o cargo desde el que se reporta. La lista es cerrada a proposito: con
 * texto libre, "Asesor", "asesores" y "ASESOR" serian tres filas distintas al
 * agrupar el analisis del 9.1.3.
 */
export const AREAS_REPORTE = [
  "team_leader",
  "asesor",
  "administrativo",
  "gerencia",
] as const;

/** Los tipos donde hubo incumplimiento y el 10.2 exige causa raíz. */
export const TIPOS_QUE_EXIGEN_CAUSA: readonly (typeof TIPOS_SUGERENCIA)[number][] = [
  "queja",
  "no_conformidad",
];

export const ESTADOS_SUGERENCIA = [
  "recibida",
  "en_proceso",
  "cerrada",
  "rechazada",
] as const;

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `No puede superar ${max} caracteres`)
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null));

const fechaOpcional = z.iso.date().nullish().transform((v) => v || null);

/**
 * Que se le pide a quien reporta, segun el tipo de registro.
 *
 * Una felicitacion no tiene "a quien afecta" ni propuesta de mejora: pedirlas
 * obliga a rellenar con texto inventado, y ese relleno acaba contaminando el
 * analisis del 9.1.3. Una queja o una no conformidad, al reves, no sirven de
 * evidencia sin el impacto; y una sugerencia sin propuesta es un comentario.
 *
 * Esta tabla manda en los dos sitios a la vez -decide que campos pinta el
 * formulario y cuales exige el esquema-, asi que vive aqui y no en la capa
 * visual: si se separaran, el formulario podria ocultar un campo que el
 * servidor sigue exigiendo.
 */
type Exigencia = "obligatorio" | "opcional" | "oculto";

export const CAMPOS_POR_TIPO: Record<
  (typeof TIPOS_SUGERENCIA)[number],
  { impacto: Exigencia; propuesta: Exigencia; desea_respuesta: boolean }
> = {
  sugerencia: { impacto: "oculto", propuesta: "obligatorio", desea_respuesta: true },
  queja: { impacto: "obligatorio", propuesta: "opcional", desea_respuesta: true },
  felicitacion: { impacto: "oculto", propuesta: "oculto", desea_respuesta: false },
  no_conformidad: { impacto: "obligatorio", propuesta: "opcional", desea_respuesta: true },
  oportunidad_mejora: { impacto: "oculto", propuesta: "obligatorio", desea_respuesta: true },
};

/** Lo que escribe quien envía. Una vez guardado no se edita: es el hecho. */
export const esquemaSugerencia = z
  .object({
    tipo: z.enum(TIPOS_SUGERENCIA),
    proceso: z.enum(AREAS_REPORTE, {
      message: "Selecciona el proceso o área de quien reporta",
    }),
    ocurrido_en: fechaOpcional,
    descripcion: z
      .string()
      .trim()
      .min(20, "Describe el hecho con al menos 20 caracteres")
      .max(4000, "La descripción no puede superar 4000 caracteres"),
    // Opcionales en el tipo base: cuales son obligatorios de verdad lo decide
    // CAMPOS_POR_TIPO unas lineas mas abajo.
    impacto: textoOpcional(1000),
    propuesta: textoOpcional(2000),
    desea_respuesta: z.boolean().default(false),
  })
  .superRefine((d, ctx) => {
    const campos = CAMPOS_POR_TIPO[d.tipo];
    if (campos.impacto === "obligatorio" && (d.impacto ?? "").length < 5) {
      ctx.addIssue({
        code: "custom",
        path: ["impacto"],
        message: "Indica a quién o a qué afecta",
      });
    }
    if (campos.propuesta === "obligatorio" && (d.propuesta ?? "").length < 10) {
      ctx.addIssue({
        code: "custom",
        path: ["propuesta"],
        message: "Escribe qué propones, con al menos 10 caracteres",
      });
    }
  })
  // Se vacia lo que el tipo no pide. Si alguien escribio el impacto y despues
  // cambio el tipo a felicitacion, ese texto no debe viajar ni guardarse: la
  // fila quedaria con un dato que el formulario ya no muestra a nadie.
  .transform((d) => {
    const campos = CAMPOS_POR_TIPO[d.tipo];
    return {
      ...d,
      impacto: campos.impacto === "oculto" ? null : d.impacto,
      propuesta: campos.propuesta === "oculto" ? null : d.propuesta,
      desea_respuesta: campos.desea_respuesta ? d.desea_respuesta : false,
    };
  });

export type DatosSugerencia = z.infer<typeof esquemaSugerencia>;

/**
 * Lo que registra el administrador al tratar el caso.
 *
 * El apartado 10.2 exige causa y acción para dar por cerrada una no
 * conformidad, y trazabilidad para descartarla. La base lo impone con dos
 * CHECK; esto lo repite antes de viajar para dar un mensaje entendible en
 * lugar de un error de Postgres.
 */
export const esquemaTratamiento = z
  .object({
    id: uuid,
    // El tipo viaja solo para saber si hay que exigir causa raíz. Lo fijó
    // quien envió el caso y desde aquí no se actualiza.
    tipo: z.enum(TIPOS_SUGERENCIA),
    estado: z.enum(ESTADOS_SUGERENCIA),
    responsable_id: uuid.nullish().transform((v) => v || null),
    analisis_causa: textoOpcional(4000),
    accion_tomada: textoOpcional(4000),
    fecha_compromiso: fechaOpcional,
    eficacia_verificada: z.boolean().nullish().transform((v) => v ?? null),
    eficacia_nota: textoOpcional(2000),
    respuesta_emisor: textoOpcional(4000),
    // Solo el nombre del archivo: la ruta la arma el servidor con el id del
    // caso, para que nadie pueda apuntar la evidencia a otro expediente.
    evidencia_nombre: textoOpcional(200),
    evidencia_nueva: z.boolean().default(false),
  })
  .superRefine((d, ctx) => {
    if (d.estado === "rechazada" && !d.respuesta_emisor) {
      ctx.addIssue({
        code: "custom",
        path: ["respuesta_emisor"],
        message: "Para descartar un caso hay que dejar escrita la justificación.",
      });
    }

    if (d.estado !== "cerrada") return;

    if (!d.accion_tomada) {
      ctx.addIssue({
        code: "custom",
        path: ["accion_tomada"],
        message: "Escribe la gestión que se hizo antes de cerrar el caso.",
      });
    }
    // La misma regla vive como CHECK en la base. Aquí solo se adelanta para
    // dar un mensaje entendible en vez de un error de Postgres.
    if (!d.evidencia_nombre) {
      ctx.addIssue({
        code: "custom",
        path: ["evidencia_nombre"],
        message: "Adjunta el pantallazo de la respuesta enviada por correo.",
      });
    }
    if (TIPOS_QUE_EXIGEN_CAUSA.includes(d.tipo) && !d.analisis_causa) {
      ctx.addIssue({
        code: "custom",
        path: ["analisis_causa"],
        message:
          "Una queja o una no conformidad no se cierra sin análisis de causa (ISO 9001, 10.2).",
      });
    }
  });

export type DatosTratamiento = z.infer<typeof esquemaTratamiento>;

/** Boton "Gestionar": solo necesita saber de que caso se habla. */
export const esquemaIdSugerencia = z.object({ id: uuid });

/**
 * Boton "Rechazar". El motivo es obligatorio y con un minimo real: es lo
 * unico que quedara para responder, meses despues, por que se desecho el
 * caso. Un "no aplica" de tres letras no responde eso.
 */
export const esquemaRechazo = z.object({
  id: uuid,
  motivo: z
    .string()
    .trim()
    .min(10, "Explica por qué se rechaza: es lo que se consultará después")
    .max(4000, "El motivo no puede superar 4000 caracteres"),
});

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
