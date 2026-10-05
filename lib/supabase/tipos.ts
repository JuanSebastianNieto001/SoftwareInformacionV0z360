/**
 * Tipos de la base de datos, escritos a mano a partir de
 * supabase/migrations/001_esquema_inicial.sql.
 *
 * Cuando tengas el proyecto enlazado puedes regenerarlos con:
 *   npx supabase gen types typescript --linked > lib/supabase/tipos.ts
 * (revisa que se conserven los alias del final del archivo).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type RolGlobal = "admin" | "editor" | "lector";
export type NivelAcceso = "lectura" | "descarga" | "edicion" | "total";
export type Accion =
  | "listar"
  | "abrir"
  | "descargar"
  | "subir"
  | "editar"
  | "eliminar"
  | "login";
export type EstadoDocumento = "vigente" | "programado" | "vencido" | "purgado";

export type TipoSugerencia =
  | "sugerencia"
  | "queja"
  | "felicitacion"
  | "no_conformidad"
  | "oportunidad_mejora";
export type EstadoSugerencia = "recibida" | "en_proceso" | "cerrada" | "rechazada";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13";
  };
  public: {
    Tables: {
      perfiles: {
        Row: {
          id: string;
          nombre: string;
          cargo: string | null;
          rol: RolGlobal;
          activo: boolean;
          gestiona_buzon: boolean;
          ultimo_login: string | null;
          creado_en: string;
          actualizado_en: string;
        };
        Insert: {
          id: string;
          nombre?: string;
          cargo?: string | null;
          rol?: RolGlobal;
          activo?: boolean;
          gestiona_buzon?: boolean;
          ultimo_login?: string | null;
          creado_en?: string;
          actualizado_en?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          cargo?: string | null;
          rol?: RolGlobal;
          activo?: boolean;
          gestiona_buzon?: boolean;
          ultimo_login?: string | null;
          creado_en?: string;
          actualizado_en?: string;
        };
        Relationships: [];
      };
      areas: {
        Row: {
          id: string;
          nombre: string;
          slug: string;
          descripcion: string | null;
          activa: boolean;
          modulo: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          slug: string;
          descripcion?: string | null;
          activa?: boolean;
          modulo?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          slug?: string;
          descripcion?: string | null;
          activa?: boolean;
          modulo?: string | null;
          creado_en?: string;
        };
        Relationships: [];
      };
      grupos: {
        Row: {
          id: string;
          nombre: string;
          slug: string;
          descripcion: string | null;
          activo: boolean;
          creado_en: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          slug: string;
          descripcion?: string | null;
          activo?: boolean;
          creado_en?: string;
        };
        Update: {
          nombre?: string;
          slug?: string;
          descripcion?: string | null;
          activo?: boolean;
        };
        Relationships: [];
      };
      grupos_usuarios: {
        Row: {
          grupo_id: string;
          usuario_id: string;
          agregado_por: string | null;
          agregado_en: string;
        };
        Insert: {
          grupo_id: string;
          usuario_id: string;
          agregado_por?: string | null;
          agregado_en?: string;
        };
        Update: { agregado_por?: string | null };
        Relationships: [];
      };
      permisos_grupo: {
        Row: {
          grupo_id: string;
          area_id: string;
          nivel: NivelAcceso;
          otorgado_por: string | null;
          otorgado_en: string;
        };
        Insert: {
          grupo_id: string;
          area_id: string;
          nivel?: NivelAcceso;
          otorgado_por?: string | null;
          otorgado_en?: string;
        };
        Update: { nivel?: NivelAcceso; otorgado_por?: string | null; otorgado_en?: string };
        Relationships: [];
      };
      permisos_area: {
        Row: {
          usuario_id: string;
          area_id: string;
          nivel: NivelAcceso;
          otorgado_por: string | null;
          otorgado_en: string;
        };
        Insert: {
          usuario_id: string;
          area_id: string;
          nivel?: NivelAcceso;
          otorgado_por?: string | null;
          otorgado_en?: string;
        };
        Update: {
          usuario_id?: string;
          area_id?: string;
          nivel?: NivelAcceso;
          otorgado_por?: string | null;
          otorgado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "permisos_area_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "perfiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "permisos_area_area_id_fkey";
            columns: ["area_id"];
            isOneToOne: false;
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "permisos_area_otorgado_por_fkey";
            columns: ["otorgado_por"];
            isOneToOne: false;
            referencedRelation: "perfiles";
            referencedColumns: ["id"];
          },
        ];
      };
      documentos: {
        Row: {
          id: string;
          area_id: string;
          titulo: string;
          descripcion: string | null;
          etiquetas: string[];
          storage_path: string;
          nombre_archivo: string;
          mime: string | null;
          tamano_bytes: number | null;
          version: number;
          vigente_desde: string;
          vigente_hasta: string | null;
          subido_por: string | null;
          actualizado_por: string | null;
          creado_en: string;
          actualizado_en: string;
          purgado_en: string | null;
        };
        Insert: {
          id?: string;
          area_id: string;
          titulo: string;
          descripcion?: string | null;
          etiquetas?: string[];
          storage_path: string;
          nombre_archivo: string;
          mime?: string | null;
          tamano_bytes?: number | null;
          version?: number;
          vigente_desde?: string;
          vigente_hasta?: string | null;
          subido_por?: string | null;
          actualizado_por?: string | null;
          creado_en?: string;
          actualizado_en?: string;
          purgado_en?: string | null;
        };
        Update: {
          id?: string;
          area_id?: string;
          titulo?: string;
          descripcion?: string | null;
          etiquetas?: string[];
          storage_path?: string;
          nombre_archivo?: string;
          mime?: string | null;
          tamano_bytes?: number | null;
          version?: number;
          vigente_desde?: string;
          vigente_hasta?: string | null;
          subido_por?: string | null;
          actualizado_por?: string | null;
          creado_en?: string;
          actualizado_en?: string;
          purgado_en?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "documentos_area_id_fkey";
            columns: ["area_id"];
            isOneToOne: false;
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documentos_subido_por_fkey";
            columns: ["subido_por"];
            isOneToOne: false;
            referencedRelation: "perfiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documentos_actualizado_por_fkey";
            columns: ["actualizado_por"];
            isOneToOne: false;
            referencedRelation: "perfiles";
            referencedColumns: ["id"];
          },
        ];
      };
      accesos: {
        Row: {
          id: number;
          usuario_id: string | null;
          usuario_email: string;
          usuario_nombre: string;
          documento_id: string | null;
          doc_titulo: string;
          area_nombre: string;
          accion: Accion;
          ip: string | null;
          user_agent: string | null;
          ocurrio_en: string;
        };
        Insert: {
          id?: never;
          usuario_id?: string | null;
          usuario_email: string;
          usuario_nombre?: string;
          documento_id?: string | null;
          doc_titulo: string;
          area_nombre?: string;
          accion: Accion;
          ip?: string | null;
          user_agent?: string | null;
          ocurrio_en?: string;
        };
        Update: {
          id?: never;
          usuario_id?: string | null;
          usuario_email?: string;
          usuario_nombre?: string;
          documento_id?: string | null;
          doc_titulo?: string;
          area_nombre?: string;
          accion?: Accion;
          ip?: string | null;
          user_agent?: string | null;
          ocurrio_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accesos_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "perfiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "accesos_documento_id_fkey";
            columns: ["documento_id"];
            isOneToOne: false;
            referencedRelation: "documentos";
            referencedColumns: ["id"];
          },
        ];
      };
      sugerencias: {
        Row: {
          id: string;
          consecutivo: number;
          emisor_id: string | null;
          emisor_email: string;
          emisor_nombre: string;
          tipo: TipoSugerencia;
          proceso: string;
          ocurrido_en: string | null;
          descripcion: string;
          // Nullable desde 005: solo queja y no conformidad lo exigen.
          impacto: string | null;
          propuesta: string | null;
          desea_respuesta: boolean;
          estado: EstadoSugerencia;
          responsable_id: string | null;
          analisis_causa: string | null;
          accion_tomada: string | null;
          fecha_compromiso: string | null;
          cerrada_en: string | null;
          eficacia_verificada: boolean | null;
          eficacia_nota: string | null;
          respuesta_emisor: string | null;
          evidencia_path: string | null;
          evidencia_nombre: string | null;
          evidencia_subida_en: string | null;
          creado_en: string;
          actualizado_en: string;
        };
        Insert: {
          id?: string;
          consecutivo?: never;
          emisor_id: string;
          emisor_email: string;
          emisor_nombre?: string;
          tipo: TipoSugerencia;
          proceso: string;
          ocurrido_en?: string | null;
          descripcion: string;
          impacto?: string | null;
          propuesta?: string | null;
          desea_respuesta?: boolean;
          estado?: EstadoSugerencia;
          responsable_id?: string | null;
          analisis_causa?: string | null;
          accion_tomada?: string | null;
          fecha_compromiso?: string | null;
          cerrada_en?: string | null;
          eficacia_verificada?: boolean | null;
          eficacia_nota?: string | null;
          respuesta_emisor?: string | null;
          evidencia_path?: string | null;
          evidencia_nombre?: string | null;
          evidencia_subida_en?: string | null;
          creado_en?: string;
          actualizado_en?: string;
        };
        Update: {
          id?: string;
          consecutivo?: never;
          emisor_id?: string | null;
          emisor_email?: string;
          emisor_nombre?: string;
          tipo?: TipoSugerencia;
          proceso?: string;
          ocurrido_en?: string | null;
          descripcion?: string;
          impacto?: string | null;
          propuesta?: string | null;
          desea_respuesta?: boolean;
          estado?: EstadoSugerencia;
          responsable_id?: string | null;
          analisis_causa?: string | null;
          accion_tomada?: string | null;
          fecha_compromiso?: string | null;
          cerrada_en?: string | null;
          eficacia_verificada?: boolean | null;
          eficacia_nota?: string | null;
          respuesta_emisor?: string | null;
          evidencia_path?: string | null;
          evidencia_nombre?: string | null;
          evidencia_subida_en?: string | null;
          creado_en?: string;
          actualizado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sugerencias_emisor_id_fkey";
            columns: ["emisor_id"];
            isOneToOne: false;
            referencedRelation: "perfiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sugerencias_responsable_id_fkey";
            columns: ["responsable_id"];
            isOneToOne: false;
            referencedRelation: "perfiles";
            referencedColumns: ["id"];
          },
        ];
      };
      evaluacion_pesos: {
        Row: { perspectiva: PerspectivaEvaluacion; peso: number };
        Insert: { perspectiva: PerspectivaEvaluacion; peso: number };
        Update: { perspectiva?: PerspectivaEvaluacion; peso?: number };
        Relationships: [];
      };
      evaluacion_cargos: {
        Row: {
          id: string;
          codigo: string;
          nombre: string;
          area_departamento: string;
          hoja: string;
          etiqueta_evaluado: string;
          campana_defecto: string | null;
          orden: number;
          activo: boolean;
        };
        Insert: {
          id?: string;
          codigo: string;
          nombre: string;
          area_departamento: string;
          hoja: string;
          etiqueta_evaluado: string;
          campana_defecto?: string | null;
          orden: number;
          activo?: boolean;
        };
        Update: {
          id?: string;
          codigo?: string;
          nombre?: string;
          area_departamento?: string;
          hoja?: string;
          etiqueta_evaluado?: string;
          campana_defecto?: string | null;
          orden?: number;
          activo?: boolean;
        };
        Relationships: [];
      };
      evaluacion_criterios: {
        Row: { id: string; cargo_id: string; orden: number; categoria: string; criterio: string };
        Insert: { id?: string; cargo_id: string; orden: number; categoria: string; criterio: string };
        Update: { id?: string; cargo_id?: string; orden?: number; categoria?: string; criterio?: string };
        Relationships: [];
      };
      evaluaciones: {
        Row: {
          id: string;
          area_id: string;
          cargo_id: string;
          periodo: string;
          evaluado_nombre: string;
          evaluado_id: string | null;
          campana: string | null;
          fecha_evaluacion: string;
          evaluador_nombre: string;
          evaluador_cargo: string | null;
          plan_accion: string | null;
          estado: EstadoEvaluacion;
          cerrada_en: string | null;
          creado_por: string | null;
          creado_en: string;
          actualizado_por: string | null;
          actualizado_en: string;
        };
        Insert: {
          id?: string;
          area_id: string;
          cargo_id: string;
          periodo: string;
          evaluado_nombre: string;
          evaluado_id?: string | null;
          campana?: string | null;
          fecha_evaluacion?: string;
          evaluador_nombre: string;
          evaluador_cargo?: string | null;
          plan_accion?: string | null;
          estado?: EstadoEvaluacion;
          cerrada_en?: string | null;
          creado_por?: string | null;
          creado_en?: string;
          actualizado_por?: string | null;
          actualizado_en?: string;
        };
        Update: {
          id?: string;
          area_id?: string;
          cargo_id?: string;
          periodo?: string;
          evaluado_nombre?: string;
          evaluado_id?: string | null;
          campana?: string | null;
          fecha_evaluacion?: string;
          evaluador_nombre?: string;
          evaluador_cargo?: string | null;
          plan_accion?: string | null;
          estado?: EstadoEvaluacion;
          cerrada_en?: string | null;
          creado_por?: string | null;
          creado_en?: string;
          actualizado_por?: string | null;
          actualizado_en?: string;
        };
        Relationships: [];
      };
      evaluacion_calificaciones: {
        Row: {
          evaluacion_id: string;
          criterio_id: string;
          perspectiva: PerspectivaEvaluacion;
          calificacion: number;
        };
        Insert: {
          evaluacion_id: string;
          criterio_id: string;
          perspectiva: PerspectivaEvaluacion;
          calificacion: number;
        };
        Update: {
          evaluacion_id?: string;
          criterio_id?: string;
          perspectiva?: PerspectivaEvaluacion;
          calificacion?: number;
        };
        Relationships: [];
      };
      evaluacion_observaciones: {
        Row: { evaluacion_id: string; criterio_id: string; observacion: string };
        Insert: { evaluacion_id: string; criterio_id: string; observacion: string };
        Update: { evaluacion_id?: string; criterio_id?: string; observacion?: string };
        Relationships: [];
      };
      evaluacion_360_preguntas: {
        Row: { codigo: string; orden: number; competencia: string; pregunta: string };
        Insert: { codigo: string; orden: number; competencia: string; pregunta: string };
        Update: { codigo?: string; orden?: number; competencia?: string; pregunta?: string };
        Relationships: [];
      };
      evaluacion_360_respuestas: {
        Row: {
          id: string;
          area_id: string;
          consecutivo: number;
          evaluado_nombre: string;
          evaluado_id: string | null;
          evaluador_nombre: string;
          evaluador_id: string | null;
          cargo_id: string;
          perspectiva: PerspectivaEvaluacion;
          fecha: string;
          comentarios: string | null;
          evaluador_cargo: string | null;
          p1: number;
          p2: number;
          p3: number;
          p4: number;
          p5: number;
          p6: number;
          p7: number;
          p8: number;
          p9: number;
          p10: number;
          p11: number;
          p12: number;
          creado_por: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          area_id: string;
          evaluado_nombre: string;
          evaluado_id?: string | null;
          evaluador_nombre: string;
          evaluador_id?: string | null;
          cargo_id: string;
          perspectiva: PerspectivaEvaluacion;
          fecha?: string;
          comentarios?: string | null;
          evaluador_cargo?: string | null;
          p1: number;
          p2: number;
          p3: number;
          p4: number;
          p5: number;
          p6: number;
          p7: number;
          p8: number;
          p9: number;
          p10: number;
          p11: number;
          p12: number;
          creado_por?: string | null;
          creado_en?: string;
        };
        Update: {
          evaluado_nombre?: string;
          evaluado_id?: string | null;
          evaluador_nombre?: string;
          evaluador_id?: string | null;
          cargo_id?: string;
          perspectiva?: PerspectivaEvaluacion;
          fecha?: string;
          comentarios?: string | null;
          evaluador_cargo?: string | null;
          p1?: number;
          p2?: number;
          p3?: number;
          p4?: number;
          p5?: number;
          p6?: number;
          p7?: number;
          p8?: number;
          p9?: number;
          p10?: number;
          p11?: number;
          p12?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      v_evaluacion_resultados: {
        Row: {
          evaluacion_id: string;
          n_criterios: number;
          autoevaluacion: number | null;
          jefe_inmediato: number | null;
          pares: number | null;
          subordinados: number | null;
          n_calificaciones: number;
          nota_final: number | null;
        };
        Relationships: [];
      };
      v_evaluacion_360: {
        Row: Database["public"]["Tables"]["evaluacion_360_respuestas"]["Row"] & {
          cargo_nombre: string;
          promedio: number;
          liderazgo: number;
          trabajo_equipo: number;
          calidad_resultados: number;
          adaptabilidad: number;
        };
        Relationships: [];
      };
      v_documentos_estado: {
        Row: {
          id: string;
          area_id: string;
          titulo: string;
          descripcion: string | null;
          etiquetas: string[];
          storage_path: string;
          nombre_archivo: string;
          mime: string | null;
          tamano_bytes: number | null;
          version: number;
          vigente_desde: string;
          vigente_hasta: string | null;
          subido_por: string | null;
          actualizado_por: string | null;
          creado_en: string;
          actualizado_en: string;
          purgado_en: string | null;
          estado: EstadoDocumento;
          area_nombre: string;
          subido_por_nombre: string | null;
          veces_consultado: number;
          usuarios_distintos: number;
        };
        Relationships: [
          {
            foreignKeyName: "documentos_area_id_fkey";
            columns: ["area_id"];
            isOneToOne: false;
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
        ];
      };
      v_auditoria: {
        Row: {
          ocurrio_en: string;
          usuario_nombre: string;
          usuario_email: string;
          accion: Accion;
          doc_titulo: string;
          area_nombre: string;
          ip: string | null;
          documento_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      mi_rol: {
        Args: Record<PropertyKey, never>;
        Returns: RolGlobal | null;
      };
      soy_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      gestiono_buzon: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      login_frenado: {
        Args: { p_correo: string; p_ip: string | null };
        Returns: boolean;
      };
      anotar_intento_login: {
        Args: { p_correo: string; p_ip: string | null };
        Returns: undefined;
      };
      olvidar_intentos_login: {
        Args: { p_correo: string; p_ip: string | null };
        Returns: undefined;
      };
      nivel_en_area: {
        Args: { a: string };
        Returns: NivelAcceso | null;
      };
      uuid_seguro: {
        Args: { t: string };
        Returns: string | null;
      };
      area_evaluacion: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      estado_documento: {
        Args: { d: Database["public"]["Tables"]["documentos"]["Row"] };
        Returns: string;
      };
      docs_por_purgar: {
        Args: { dias_gracia?: number };
        Returns: { id: string; storage_path: string }[];
      };
      marcar_purgados: {
        Args: { ids: string[] };
        Returns: number;
      };
      pendientes_de_leer: {
        Args: { doc: string };
        Returns: { usuario_id: string; nombre: string; email: string }[];
      };
    };
    Enums: {
      rol_global: RolGlobal;
      nivel_acceso: NivelAcceso;
      tipo_sugerencia: TipoSugerencia;
      estado_sugerencia: EstadoSugerencia;
      perspectiva_360: PerspectivaEvaluacion;
    };
    CompositeTypes: Record<PropertyKey, never>;
  };
};

// ---------- Alias cómodos ----------
export type Tablas = Database["public"]["Tables"];
export type Perfil = Tablas["perfiles"]["Row"];
export type Area = Tablas["areas"]["Row"];
export type PermisoArea = Tablas["permisos_area"]["Row"];
export type Documento = Tablas["documentos"]["Row"];
export type Acceso = Tablas["accesos"]["Row"];
export type Sugerencia = Tablas["sugerencias"]["Row"];

// ---------- Evaluación de desempeño ----------
export type PerspectivaEvaluacion =
  | "autoevaluacion"
  | "jefe_inmediato"
  | "pares"
  | "subordinados"
  | "alta_direccion";
export type EstadoEvaluacion = "borrador" | "cerrada";
export type CargoEvaluacion = Tablas["evaluacion_cargos"]["Row"];
export type CriterioEvaluacion = Tablas["evaluacion_criterios"]["Row"];
export type Evaluacion = Tablas["evaluaciones"]["Row"];
export type CalificacionEvaluacion = Tablas["evaluacion_calificaciones"]["Row"];
export type Pregunta360 = Tablas["evaluacion_360_preguntas"]["Row"];
export type Respuesta360 = Tablas["evaluacion_360_respuestas"]["Row"];
export type ResultadoEvaluacion = Database["public"]["Views"]["v_evaluacion_resultados"]["Row"];
export type Respuesta360Calculada = Database["public"]["Views"]["v_evaluacion_360"]["Row"];
export type DocumentoConEstado =
  Database["public"]["Views"]["v_documentos_estado"]["Row"];
export type FilaAuditoria = Database["public"]["Views"]["v_auditoria"]["Row"];
