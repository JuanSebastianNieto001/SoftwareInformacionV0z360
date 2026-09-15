-- =====================================================================
-- BUZÓN DE SUGERENCIAS — ISO 9001:2015
-- =====================================================================
-- Cubre la retroalimentación del apartado 8.2.1, la comunicación interna
-- del 7.4, el análisis del 9.1.3 y, para las no conformidades, el ciclo
-- completo del 10.2: registro del hecho, análisis de la causa, acción
-- tomada, cierre y verificación de la eficacia.
--
-- Dos bloques de columnas con dueños distintos:
--   · ENTRADA    — la llena quien envía. Nadie la puede alterar después.
--   · TRATAMIENTO— la llena el admin. El emisor la lee pero no la escribe.
-- Esa separación es lo que hace que el registro sirva como evidencia:
-- si el emisor pudiera editar su propio texto tras la respuesta, el
-- historial dejaría de probar nada.
-- =====================================================================

-- ---------- 1. TIPOS ----------

create type tipo_sugerencia as enum (
  'sugerencia',          -- idea de mejora, sin incumplimiento de por medio
  'queja',               -- reclamo por un servicio o trato recibido
  'felicitacion',        -- reconocimiento (9.1.2: también es retroalimentación)
  'no_conformidad',      -- incumplimiento de un requisito (10.2)
  'oportunidad_mejora'   -- mejora detectada en un proceso (10.3)
);

create type estado_sugerencia as enum (
  'recibida',
  'en_analisis',
  'en_accion',
  'cerrada',
  'rechazada'
);

-- ---------- 2. TABLA ----------

create table sugerencias (
  id          uuid   primary key default gen_random_uuid(),
  -- Consecutivo estable para citar el caso en una auditoría ("BZ-000042").
  consecutivo bigint generated always as identity unique,

  -- ----- ENTRADA: la escribe el emisor, una sola vez -----
  -- Nullable, y con el correo copiado abajo: si el perfil se borra la fila
  -- sobrevive diciendo quien la presento, igual que en la tabla accesos.
  -- Un "not null" aqui ademas haria fallar el borrado del usuario.
  emisor_id     uuid references perfiles (id) on delete set null,
  emisor_email  text not null,
  emisor_nombre text not null default '',

  tipo        tipo_sugerencia not null,
  proceso     text not null,          -- proceso o área a la que se refiere
  ocurrido_en date,                   -- cuándo pasó (NULL = no aplica)
  descripcion text not null,          -- los hechos
  impacto     text not null,          -- a quién o a qué afecta
  propuesta   text,                   -- propuesta de mejora del emisor
  desea_respuesta boolean not null default false,

  -- ----- TRATAMIENTO: solo el admin -----
  estado          estado_sugerencia not null default 'recibida',
  responsable_id  uuid references perfiles (id) on delete set null,
  analisis_causa  text,               -- 10.2 b) causa raíz
  accion_tomada   text,               -- 10.2 a) corrección y acción correctiva
  fecha_compromiso date,
  cerrada_en      timestamptz,
  eficacia_verificada boolean,        -- 10.2 d) ¿sirvió la acción?
  eficacia_nota   text,
  respuesta_emisor text,              -- lo que se le comunica a quien envió

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  -- Una no conformidad no se cierra sin causa ni acción: es justo lo que
  -- pide el 10.2. La base lo exige para que no dependa de la disciplina
  -- de quien llene el formulario.
  constraint cierre_documentado check (
    estado <> 'cerrada'
    or (analisis_causa is not null and accion_tomada is not null)
  ),
  -- Rechazar también exige explicación: sin ella no hay trazabilidad.
  constraint rechazo_justificado check (
    estado <> 'rechazada' or respuesta_emisor is not null
  )
);

comment on table sugerencias is
  'Buzón de sugerencias, quejas y no conformidades (ISO 9001:2015).';
comment on column sugerencias.consecutivo is
  'Número de radicado para citar el caso en auditoría.';

create index idx_sugerencias_estado  on sugerencias (estado, creado_en desc);
create index idx_sugerencias_emisor  on sugerencias (emisor_id, creado_en desc);
create index idx_sugerencias_tipo    on sugerencias (tipo, creado_en desc);

create trigger trg_sugerencias_actualizado
  before update on sugerencias
  for each row execute function public.tocar_actualizado_en();

-- ---------- 3. RLS ----------

alter table sugerencias enable row level security;

-- Cualquiera con sesión puede enviar, siempre a su propio nombre.
create policy sugerencias_insert_propia on sugerencias
  for insert to authenticated
  with check (emisor_id = auth.uid());

-- Ves lo tuyo; el admin lo ve todo.
create policy sugerencias_select_propia_o_admin on sugerencias
  for select to authenticated
  using (emisor_id = auth.uid() or public.soy_admin());

-- El tratamiento es exclusivo del admin. Al no existir política de update
-- para el emisor, su relato queda congelado desde el envío.
create policy sugerencias_update_admin on sugerencias
  for update to authenticated
  using (public.soy_admin())
  with check (public.soy_admin());

-- Sin política de delete, a propósito: el 7.5 pide conservar la
-- información documentada. Para descartar un caso se usa 'rechazada'.
