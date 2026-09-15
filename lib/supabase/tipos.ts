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
export type NivelAcceso = "lectura" | "edicion";
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
          creado_en: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          slug: string;
          descripcion?: string | null;
          activa?: boolean;
          creado_en?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          slug?: string;
          descripcion?: string | null;
          activa?: boolean;
          creado_en?: string;
        };
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
          impacto: string;
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
          impacto: string;
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
          impacto?: string;
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
    };
    Views: {
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
      nivel_en_area: {
        Args: { a: string };
        Returns: NivelAcceso | null;
      };
      uuid_seguro: {
        Args: { t: string };
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
export type DocumentoConEstado =
  Database["public"]["Views"]["v_documentos_estado"]["Row"];
export type FilaAuditoria = Database["public"]["Views"]["v_auditoria"]["Row"];
