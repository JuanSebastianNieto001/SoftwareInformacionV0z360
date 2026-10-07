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
export const NIVELES = ["lectura", "descarga", "edicion", "total"] as const;
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

/**
 * La que reparte el administrador y dura un solo inicio de sesión.
 *
 * Seis en vez de ocho porque vive hasta que la persona entra y la cambia, y
 * porque seis es el mínimo que acepta Supabase: por debajo de eso el alta
 * falla del lado del servidor de autenticación, no aquí. Si el
 * administrador desmarca "obligar a cambiarla" la contraseña deja de ser
 * temporal, y entonces se le exigen los ocho: eso lo comprueba cada
 * esquema que la usa.
 */
const contrasenaTemporal = z
  .string()
  .min(6, "La contraseña temporal debe tener al menos 6 caracteres")
  .max(72, "La contraseña es demasiado larga");

/** Si una contraseña que no se va a cambiar cumple la regla larga. */
function exigirLargaSiEsPermanente(
  d: { exigir_cambio: boolean },
  clave: string | undefined,
  campo: string,
  ctx: z.RefinementCtx,
) {
  if (clave && !d.exigir_cambio && clave.length < 8) {
    ctx.addIssue({
      code: "custom",
      path: [campo],
      message:
        "Si no se va a obligar a cambiarla, la contraseña debe tener al menos 8 caracteres.",
    });
  }
}

/**
 * Dominio interno de las cuentas que entran con su número de Poliedro.
 *
 * No existe como buzón de correo y no tiene registro MX a propósito: es solo
 * la forma que tiene Supabase de identificar una cuenta, porque su API de
 * autenticación exige un correo. Quien entra escribe únicamente el número.
 */
const DOMINIO_POLIEDRO = "poliedro.voz360.co";

/**
 * Convierte lo que se escribe en el login en el correo con el que la cuenta
 * existe. Un número suelto es un usuario de Poliedro; cualquier otra cosa se
 * deja igual, que es como entran las cuentas con correo propio.
 *
 * Es idempotente: aplicado dos veces da lo mismo, porque un correo ya
 * formado contiene una arroba y no vuelve a tocarse.
 */
function correoDesdeIdentificador(valor: string): string {
  const limpio = valor.trim();
  return /^[0-9]{4,15}$/.test(limpio) ? `${limpio}@${DOMINIO_POLIEDRO}` : limpio;
}

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
  // El preprocess va en el esquema y no en el formulario para que valga
  // igual en el cliente y en el servidor, que lo vuelve a parsear.
  email: z.preprocess(
    (v) => (typeof v === "string" ? correoDesdeIdentificador(v) : v),
    z.email({ message: "Escribe tu número de Poliedro o tu correo" }).trim().toLowerCase(),
  ),
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

// ---------------------------------------------------------------------------
// Grupos (segmentos de personas)
// ---------------------------------------------------------------------------

const nombreGrupo = z
  .string()
  .trim()
  .min(2, "El nombre del grupo debe tener al menos 2 caracteres")
  .max(60, "El nombre del grupo no puede superar 60 caracteres");

const descripcionGrupo = z
  .string()
  .trim()
  .max(300, "La descripción no puede superar 300 caracteres")
  .nullish()
  .transform((v) => (v && v.length > 0 ? v : null));

export const esquemaGrupoNuevo = z.object({
  nombre: nombreGrupo,
  descripcion: descripcionGrupo,
});

export const esquemaGrupoEdicion = z.object({
  id: uuid,
  nombre: nombreGrupo.optional(),
  descripcion: descripcionGrupo.optional(),
  activo: z.boolean().optional(),
});

/** Añadir o quitar a alguien del grupo. `dentro: false` lo saca. */
export const esquemaMiembroGrupo = z.object({
  grupo_id: uuid,
  usuario_id: uuid,
  dentro: z.boolean(),
});

/** Nivel que el grupo concede sobre un área. `null` retira la concesión. */
export const esquemaPermisoGrupo = z.object({
  grupo_id: uuid,
  area_id: uuid,
  nivel: z.enum(NIVELES).nullable(),
});

export const esquemaUsuarioNuevo = z.object({
  email,
  password: contrasenaTemporal,
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
  /** Marcado, la contraseña dada es temporal y se pide otra al entrar. */
  exigir_cambio: z.boolean().default(true),
})
.superRefine((d, ctx) => exigirLargaSiEsPermanente(d, d.password, "password", ctx));

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
  /** Si viene, se restablece la contraseña. */
  nueva_contrasena: contrasenaTemporal.optional(),
  /** Marcado, se le pedirá otra en cuanto entre con la que acabas de darle. */
  exigir_cambio: z.boolean().default(true),
})
.superRefine((d, ctx) =>
  exigirLargaSiEsPermanente(d, d.nueva_contrasena, "nueva_contrasena", ctx),
);

export type DatosUsuarioEdicion = z.infer<typeof esquemaUsuarioEdicion>;

// ---------------------------------------------------------------------------
// Auditoría (filtros por query string)
// ---------------------------------------------------------------------------

export const esquemaFiltrosAuditoria = z.object({
  usuario: uuid.optional(),
  /** Filtra por todas las personas del segmento, no por una sola. */
  grupo: uuid.optional(),
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
// ---------------------------------------------------------------------------
// Evaluación de desempeño
// ---------------------------------------------------------------------------

export const PERSPECTIVAS_360 = [
  "autoevaluacion",
  "jefe_inmediato",
  "pares",
  "subordinados",
  "alta_direccion",
] as const;

/** Las cuatro del formato por cargo: la matriz 360 añade alta dirección. */
export const PERSPECTIVAS_FORMATO = [
  "autoevaluacion",
  "jefe_inmediato",
  "pares",
  "subordinados",
] as const;

export const ESTADOS_EVALUACION = ["borrador", "cerrada"] as const;

/**
 * Entre 1 y 5 con decimales, como la validación "decimal between 1,5" de
 * las hojas. Se redondea a centésimas porque la columna es numeric(3,2):
 * mandar 4.333333 y que la base lo recorte a 4.33 sin avisar es peor que
 * hacerlo aquí, donde el cliente ve lo mismo que se va a guardar.
 */
const calificacion = z.coerce
  .number({ message: "Escribe un número" })
  .min(1, "La calificación mínima es 1")
  .max(5, "La calificación máxima es 5")
  .transform((v) => Math.round(v * 100) / 100);

const nombrePersona = z
  .string()
  .trim()
  .min(2, "Escribe el nombre completo")
  .max(120, "No puede superar 120 caracteres");

export const esquemaEvaluacionNueva = z.object({
  cargo_id: uuid,
  periodo: z
    .string()
    .trim()
    .min(2, "Indica el periodo (p. ej. 2026)")
    .max(20, "No puede superar 20 caracteres"),
  evaluado_nombre: nombrePersona,
  evaluado_id: uuid.nullish().transform((v) => v || null),
  campana: textoOpcional(120),
  fecha_evaluacion: z.iso.date({ message: "Fecha inválida" }),
  evaluador_nombre: nombrePersona,
  evaluador_cargo: textoOpcional(120),
});

export type DatosEvaluacionNueva = z.infer<typeof esquemaEvaluacionNueva>;

/** Lo editable de la cabecera después de creada (el cargo ya no cambia). */
export const esquemaEvaluacionCabecera = esquemaEvaluacionNueva
  .omit({ cargo_id: true })
  .extend({ plan_accion: textoOpcional(4000) });

export type DatosEvaluacionCabecera = z.infer<typeof esquemaEvaluacionCabecera>;

/**
 * Lo que manda la hoja de calificación al guardar: todas las celdas de una
 * vez. Una calificación null significa "borrar la celda". 12 criterios × 4
 * perspectivas = 48 como máximo.
 */
export const esquemaCalificaciones = z.object({
  evaluacion_id: uuid,
  calificaciones: z
    .array(
      z.object({
        criterio_id: uuid,
        perspectiva: z.enum(PERSPECTIVAS_FORMATO),
        calificacion: calificacion.nullable(),
      }),
    )
    .max(48, "Demasiadas calificaciones"),
  observaciones: z
    .array(
      z.object({
        criterio_id: uuid,
        observacion: textoOpcional(1000),
      }),
    )
    .max(12, "Demasiadas observaciones"),
});

export type DatosCalificaciones = z.infer<typeof esquemaCalificaciones>;

export const esquemaRespuesta360 = z.object({
  cargo_id: uuid,
  evaluado_nombre: nombrePersona,
  evaluado_id: uuid.nullish().transform((v) => v || null),
  evaluador_nombre: nombrePersona,
  /** Cargo de quien responde (columna D de la hoja), no el del evaluado. */
  evaluador_cargo: textoOpcional(120),
  perspectiva: z.enum(PERSPECTIVAS_360, { message: "Elige la perspectiva" }),
  fecha: z.iso.date({ message: "Fecha inválida" }),
  comentarios: textoOpcional(2000),
  /** P1..P12, en orden. Las doce son obligatorias, como en la hoja. */
  respuestas: z
    .array(calificacion, { message: "Responde las doce preguntas" })
    .length(12, "Responde las doce preguntas"),
});

export type DatosRespuesta360 = z.infer<typeof esquemaRespuesta360>;

// ---------------------------------------------------------------------------
// Cumpleaños
// ---------------------------------------------------------------------------

/**
 * Día y mes obligatorios; el año solo si se conoce (la sección "Estructura"
 * del libro no lo trae). El team leader vacío significa que la persona es
 * de la estructura y no de un equipo.
 */
export const esquemaCumple = z
  .object({
    nombre: nombrePersona,
    usuario_id: uuid.nullish().transform((v) => v || null),
    team_leader: textoOpcional(120),
    cumple_mes: z.coerce.number().int().min(1, "Mes inválido").max(12, "Mes inválido"),
    cumple_dia: z.coerce.number().int().min(1, "Día inválido").max(31, "Día inválido"),
    anio_nacimiento: z.coerce
      .number()
      .int()
      .min(1900, "Año inválido")
      .max(2100, "Año inválido")
      .nullish()
      .transform((v) => v ?? null),
    notas: textoOpcional(500),
    activo: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    // Que el día exista en ese mes (el 30 de febrero no es una fecha).
    const dias = new Date(Date.UTC(d.anio_nacimiento ?? 2024, d.cumple_mes, 0)).getUTCDate();
    if (d.cumple_dia > dias) {
      ctx.addIssue({ code: "custom", path: ["cumple_dia"], message: `Ese mes no tiene ${d.cumple_dia} días` });
    }
  });

export type DatosCumple = z.infer<typeof esquemaCumple>;

// ---------------------------------------------------------------------------
// Calidad
// ---------------------------------------------------------------------------

export const RESULTADOS_CALIDAD = ["cumple", "no_cumple", "no_aplica"] as const;
export const TIPOS_AUDITORIA = ["Venta", "No venta"] as const;
export const ETAPAS_AUDITORIA = ["Contratados", "Seguimiento", "OJT", "PQR"] as const;
export const CANALES_AUDITORIA = ["llamada", "chat", "correo", "otro"] as const;
export const ESTADOS_COMPROMISO = ["pendiente", "en_seguimiento", "cumplido", "no_cumplido"] as const;

/** Cabecera de una auditoría (lo que identifica la interacción). */
export const esquemaAuditoria = z.object({
  matriz_id: uuid,
  asesor_id: uuid,
  fecha_interaccion: z.iso.date({ message: "Fecha de la interacción inválida" }),
  fecha_auditoria: z.iso.date({ message: "Fecha de auditoría inválida" }),
  tipo: z.enum(TIPOS_AUDITORIA, { message: "Elige el tipo" }),
  etapa: z.enum(ETAPAS_AUDITORIA).nullish().transform((v) => v ?? null),
  canal: z.enum(CANALES_AUDITORIA),
  referencia: textoOpcional(120),
  duracion: textoOpcional(20),
  detalle: textoOpcional(6000),
  puntos_mejora: textoOpcional(4000),
});
export type DatosAuditoria = z.infer<typeof esquemaAuditoria>;

/** Todas las respuestas de la pauta de una vez; null deja el ítem sin responder. */
export const esquemaRespuestasCalidad = z.object({
  evaluacion_id: uuid,
  respuestas: z
    .array(
      z.object({
        item_id: uuid,
        resultado: z.enum(RESULTADOS_CALIDAD).nullable(),
        hallazgo: textoOpcional(1000),
      }),
    )
    .max(200),
});
export type DatosRespuestasCalidad = z.infer<typeof esquemaRespuestasCalidad>;

export const esquemaRetro = z.object({
  fortalezas: textoOpcional(4000),
  oportunidades: textoOpcional(4000),
  estado: z.enum(["pendiente", "en_proceso"]),
});
export type DatosRetro = z.infer<typeof esquemaRetro>;

export const esquemaCompromiso = z.object({
  descripcion: z
    .string()
    .trim()
    .min(5, "Describe el compromiso")
    .max(500, "No puede superar 500 caracteres"),
  fecha_limite: z.iso.date({ message: "Fecha límite inválida" }),
  estado: z.enum(ESTADOS_COMPROMISO).default("pendiente"),
  avance: textoOpcional(1000),
});
export type DatosCompromiso = z.infer<typeof esquemaCompromiso>;

export const esquemaFirmaRetro = z.object({
  retro_id: uuid,
  comentarios: textoOpcional(2000),
});

export const esquemaItemCalidad = z.object({
  orden: z.coerce.number().int().min(1).max(500),
  categoria: z.string().trim().min(2, "Indica la categoría").max(80),
  descripcion: z.string().trim().min(5, "Describe el ítem").max(400),
  peso: z.coerce.number().min(0, "El peso no puede ser negativo").max(100, "El peso no puede superar 100"),
  es_fatal: z.boolean().default(false),
  activo: z.boolean().default(true),
});
export type DatosItemCalidad = z.infer<typeof esquemaItemCalidad>;

export const esquemaMatrizCalidad = z.object({
  nombre: z.string().trim().min(2).max(120),
  descripcion: textoOpcional(500),
  nota_minima: z.coerce.number().min(0).max(100),
  error_fatal_anula: z.boolean(),
  activa: z.boolean(),
});
export type DatosMatrizCalidad = z.infer<typeof esquemaMatrizCalidad>;

export const esquemaAsesorCalidad = z.object({
  nombre: nombrePersona,
  cedula: z
    .string()
    .trim()
    .regex(/^[0-9]{5,15}$/, "Cédula: solo números")
    .nullish()
    .transform((v) => v || null),
  team_leader: textoOpcional(120),
  campana: textoOpcional(120),
  fecha_contratacion: z.iso.date().nullish().transform((v) => v || null),
  usuario_id: uuid.nullish().transform((v) => v || null),
  activo: z.boolean().default(true),
});
export type DatosAsesorCalidad = z.infer<typeof esquemaAsesorCalidad>;

export function primerError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Datos inválidos";
  const ruta = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${ruta}${issue.message}`;
}

// ---------------------------------------------------------------------------
// PDA
// ---------------------------------------------------------------------------

export const SENTIDOS_PDA = ["mayor", "menor"] as const;
export const AGREGACIONES_PDA = ["ultimo", "suma", "promedio"] as const;

/** Número desde un input: acepta coma decimal ("99,5"). */
const numeroPda = (mensaje: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim().replace(",", ".") : v),
    z.coerce.number({ message: mensaje }).refine(Number.isFinite, mensaje),
  );

/** El PDA de un mes: `periodo` llega como "YYYY-MM" y se guarda como el día 1. */
export const esquemaPlanPda = z.object({
  periodo: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Elige el mes")
    .transform((v) => `${v}-01`),
  titulo: z.string().trim().min(2, "Escribe un título").max(200, "No puede superar 200 caracteres"),
  objetivo: textoOpcional(2000),
});
export type DatosPlanPda = z.infer<typeof esquemaPlanPda>;

export const esquemaIndicadorPda = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre del indicador").max(200, "No puede superar 200 caracteres"),
  descripcion: textoOpcional(2000),
  responsable: textoOpcional(120),
  unidad: z.string().trim().min(1, "Indica la unidad").max(30, "Unidad demasiado larga"),
  sentido: z.enum(SENTIDOS_PDA, { message: "Elige si la meta es un mínimo o un máximo" }),
  meta: numeroPda("Meta inválida").pipe(z.number().min(0, "La meta no puede ser negativa")),
  agregacion: z.enum(AGREGACIONES_PDA, { message: "Elige cómo se consolida" }),
  peso: numeroPda("Peso inválido").pipe(z.number().gt(0, "El peso debe ser mayor que 0").max(100, "Peso máximo 100")),
  orden: z.coerce.number().int().min(0).max(999).default(0),
});
export type DatosIndicadorPda = z.infer<typeof esquemaIndicadorPda>;

export const esquemaMedicionPda = z.object({
  indicador_id: uuid,
  fecha: z.iso.date({ message: "Fecha inválida" }),
  valor: numeroPda("Valor inválido"),
  observacion: textoOpcional(1000),
});
export type DatosMedicionPda = z.infer<typeof esquemaMedicionPda>;
