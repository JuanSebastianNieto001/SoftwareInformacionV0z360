-- =====================================================================
-- RETROALIMENTACIÓN OPERATIVA (FEEDBACK) — QualityCore ampliado
-- =====================================================================
-- Quinto cuadro-módulo. Amplía la retroalimentación más allá de Calidad: un
-- catálogo de tipos y subtipos de feedback operativo (adherencia y
-- asistencia, desempeño y métricas, calidad, y gestión de liderazgo) con
-- los campos recomendados en el documento "Tipos y Subtipos de Feedback":
-- gravedad, severidad/acción requerida, plan de acción, fecha de
-- seguimiento (alerta), estado y la conformidad del colaborador.
--
-- Quién entra lo decide la matriz de permisos, como en cualquier cuadro:
--   - Calidad y Formación (y el grupo Calidad): Edición.
--   - Administradores: todo.
-- El tipo "Gestión de Liderazgo y Equipo" es solo para dirección/gerencia:
-- un feedback de ese tipo solo lo registra un administrador (lo garantiza un
-- disparador, no la pantalla).
--
-- El colaborador que recibe el feedback puede responder su conformidad
-- (Aceptado / Aceptado con observaciones / Rechazado) desde "Mis feedback"
-- si su cuenta está vinculada; también puede registrarla quien hace la
-- sesión. La fecha y hora de la respuesta las pone la base.
-- =====================================================================

-- ---------- 1. EL CUADRO ----------
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = 'public.areas'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%modulo%'
  loop
    execute format('alter table public.areas drop constraint %I', r.conname);
  end loop;
end $$;
alter table areas add constraint areas_modulo_check
  check (modulo in ('evaluacion', 'cumpleanos', 'calidad', 'pda', 'feedback'));

insert into areas (nombre, slug, descripcion, modulo)
values (
  'Retroalimentación',
  'retroalimentacion',
  'Feedback operativo: adherencia, desempeño, calidad y liderazgo, con plan de acción, seguimiento y conformidad. Calidad y administradores.',
  'feedback'
)
on conflict (nombre) do update set modulo = excluded.modulo;

create type feedback_gravedad    as enum ('leve', 'moderado', 'grave', 'critico');
create type feedback_severidad   as enum ('notificacion', 'plan_accion', 'disciplinario');
create type feedback_estado      as enum ('abierto', 'en_seguimiento', 'cerrado', 'reincidente');
create type feedback_conformidad as enum ('aceptado', 'observaciones', 'rechazado');

-- ---------- 2. CATÁLOGO: TIPO → SUBTIPO → DETALLE ----------
create table feedback_catalogo (
  id             uuid primary key default gen_random_uuid(),
  area_id        uuid not null references areas (id) on delete restrict,
  orden          smallint not null default 0,
  tipo           text not null check (char_length(tipo) between 2 and 120),
  subtipo        text not null check (char_length(subtipo) between 2 and 160),
  detalle        text not null check (char_length(detalle) between 2 and 300),
  solo_direccion boolean not null default false,  -- tipo "Gestión de Liderazgo": solo admin
  es_positivo    boolean not null default false,  -- reconocimiento, no falta
  activo         boolean not null default true,
  creado_en      timestamptz not null default now()
);
create index feedback_catalogo_orden on feedback_catalogo (orden);

-- ---------- 3. EL FEEDBACK ----------
create table feedback (
  id                     uuid primary key default gen_random_uuid(),
  area_id                uuid not null references areas (id) on delete restrict,
  catalogo_id            uuid not null references feedback_catalogo (id) on delete restrict,
  colaborador_nombre     text not null check (char_length(colaborador_nombre) between 2 and 160),
  colaborador_cedula     text check (char_length(colaborador_cedula) <= 30),
  colaborador_usuario_id uuid references perfiles (id) on delete set null,
  team_leader            text check (char_length(team_leader) <= 160),
  fecha                  date not null,
  gravedad               feedback_gravedad not null,
  severidad              feedback_severidad not null,
  descripcion            text not null check (char_length(descripcion) between 2 and 4000),
  plan_accion            text check (char_length(plan_accion) <= 4000),
  fecha_seguimiento      date,
  estado                 feedback_estado not null default 'abierto',
  conformidad            feedback_conformidad,
  conformidad_comentario text check (char_length(conformidad_comentario) <= 2000),
  conformidad_en         timestamptz,
  creado_por             uuid references perfiles (id) on delete set null,
  creado_por_nombre      text not null default '',
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now()
);
create index feedback_colaborador on feedback (colaborador_usuario_id);
create index feedback_seguimiento on feedback (fecha_seguimiento) where estado in ('abierto', 'en_seguimiento');

create trigger trg_feedback_actualizado
  before update on feedback
  for each row execute function public.tocar_actualizado_en();

-- El área se impone desde el cuadro; la conformidad sella su fecha; y el
-- tipo de liderazgo solo lo registra un administrador.
create or replace function public.feedback_coherencia()
returns trigger language plpgsql set search_path = public as $$
declare
  v_solo_direccion boolean;
begin
  new.area_id := public.area_modulo('feedback');

  -- Solo al crear (o si se cambia el motivo): un feedback de liderazgo solo lo
  -- registra un administrador. En un update posterior (estado, conformidad del
  -- colaborador) no se vuelve a exigir, para no bloquear su respuesta.
  if tg_op = 'INSERT' or new.catalogo_id is distinct from old.catalogo_id then
    select solo_direccion into v_solo_direccion from feedback_catalogo where id = new.catalogo_id;
    if coalesce(v_solo_direccion, false) and not public.soy_admin() then
      raise exception 'El feedback de liderazgo y equipo solo lo registra dirección o gerencia';
    end if;
  end if;

  if new.conformidad is not null and (tg_op = 'INSERT' or old.conformidad is distinct from new.conformidad) then
    new.conformidad_en := now();
  elsif new.conformidad is null then
    new.conformidad_en := null;
  end if;
  return new;
end $$;

create trigger trg_feedback_coherencia
  before insert or update on feedback
  for each row execute function public.feedback_coherencia();

-- ---------- 4. VISTA ----------
create or replace view v_feedback with (security_invoker = true) as
select f.*,
       c.tipo,
       c.subtipo,
       c.detalle,
       c.solo_direccion,
       c.es_positivo,
       (f.fecha_seguimiento is not null
         and f.fecha_seguimiento < current_date
         and f.estado in ('abierto', 'en_seguimiento')) as seguimiento_vencido,
       (f.conformidad is null) as sin_conformidad
  from feedback f
  join feedback_catalogo c on c.id = f.catalogo_id;

-- ---------- 5. RESPUESTA DE CONFORMIDAD ----------
-- La registra el colaborador (si su cuenta está vinculada) o quien tiene el
-- cuadro durante la sesión. Queda en accesos con fecha y hora.
create or replace function public.responder_feedback(p_id uuid, p_conformidad text, p_comentario text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  f record;
  area uuid := public.area_modulo('feedback');
begin
  select id, colaborador_usuario_id, area_id into f from feedback where id = p_id;
  if f.id is null then raise exception 'No existe el feedback'; end if;
  if p_conformidad not in ('aceptado', 'observaciones', 'rechazado') then
    raise exception 'Conformidad inválida';
  end if;
  -- Puede responder el colaborador vinculado, o quien edita el cuadro.
  -- coalesce para que un NULL (sin vínculo o sin permiso) no deje pasar.
  if not (coalesce(f.colaborador_usuario_id = yo, false) or coalesce(public.nivel_en_area(area) >= 'edicion', false)) then
    raise exception 'No puedes responder este feedback';
  end if;

  update feedback
     set conformidad = p_conformidad::feedback_conformidad,
         conformidad_comentario = nullif(trim(p_comentario), ''),
         conformidad_en = now(),
         -- Un rechazo abre disputa (reactiva el seguimiento); el resto no cambia el estado.
         estado = case when p_conformidad = 'rechazado' and estado = 'cerrado' then 'en_seguimiento' else estado end
   where id = p_id;

  insert into accesos (usuario_id, usuario_email, usuario_nombre, doc_titulo, area_nombre, accion)
  select yo, coalesce(u.email, ''), coalesce(p.nombre, ''),
         'Conformidad de feedback ' || p_id::text || ' (' || p_conformidad || ')', 'Retroalimentación', 'editar'
    from perfiles p left join auth.users u on u.id = p.id where p.id = yo;
end $$;
grant execute on function public.responder_feedback(uuid, text, text) to authenticated;

-- ---------- 6. ALERTAS ----------
create or replace function public.generar_alertas_feedback()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  area uuid := public.area_modulo('feedback');
  pendientes integer;
begin
  if yo is null or area is null then return 0; end if;

  -- Como colaborador: feedback dirigido a mí, sin mi conformidad.
  insert into notificaciones (usuario_id, clave, tipo, titulo, cuerpo, enlace)
  select yo, 'feedback:conf:' || f.id, 'feedback',
         case when c.es_positivo then '🌟 Reconocimiento: ' else '📝 Retroalimentación: ' end || c.subtipo,
         left(f.descripcion, 120) || ' · revisa y responde tu conformidad',
         '/mis-feedback'
    from feedback f
    join feedback_catalogo c on c.id = f.catalogo_id
   where f.colaborador_usuario_id = yo and f.conformidad is null
  on conflict (usuario_id, clave) do nothing;

  -- Como gestor del cuadro: seguimientos por vencer o vencidos.
  if public.nivel_en_area(area) is not null then
    insert into notificaciones (usuario_id, clave, tipo, titulo, cuerpo, enlace)
    select yo, 'feedback:vence:' || f.id || ':' || to_char(f.fecha_seguimiento, 'YYYY-MM-DD'), 'feedback',
           case when f.fecha_seguimiento < current_date then '⏰ Seguimiento vencido: ' else '⏰ Seguimiento por vencer: ' end || f.colaborador_nombre,
           c.subtipo || ' · ' || to_char(f.fecha_seguimiento, 'DD/MM/YYYY'),
           '/feedback/' || f.id
      from feedback f
      join feedback_catalogo c on c.id = f.catalogo_id
     where f.estado in ('abierto', 'en_seguimiento')
       and f.fecha_seguimiento is not null
       and f.fecha_seguimiento <= current_date + 2
    on conflict (usuario_id, clave) do nothing;
  end if;

  select count(*) into pendientes from notificaciones where usuario_id = yo and leida_en is null;
  return pendientes;
end $$;
grant execute on function public.generar_alertas_feedback() to authenticated;

-- ---------- 7. RLS ----------
alter table feedback_catalogo enable row level security;
alter table feedback          enable row level security;

create policy feedback_catalogo_select on feedback_catalogo for select to authenticated using (true);
create policy feedback_catalogo_write on feedback_catalogo for all to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion')
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('feedback'));

-- El colaborador ve lo suyo aunque no tenga el cuadro; el cuadro ve todo.
create policy feedback_select on feedback for select to authenticated
  using (public.nivel_en_area(area_id) is not null or colaborador_usuario_id = auth.uid());
create policy feedback_insert on feedback for insert to authenticated
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('feedback') and creado_por = auth.uid());
create policy feedback_update on feedback for update to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion')
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('feedback'));
create policy feedback_delete on feedback for delete to authenticated
  using (public.soy_admin() or public.nivel_en_area(area_id) = 'total');

-- ---------- 8. CATÁLOGO SEMBRADO (documento de tipos y subtipos) ----------
insert into feedback_catalogo (area_id, orden, tipo, subtipo, detalle, solo_direccion, es_positivo)
select public.area_modulo('feedback'), v.orden, v.tipo, v.subtipo, v.detalle, v.dir, v.pos
from (values
  -- Adherencia y Asistencia
  (10, 'Adherencia y Asistencia', 'Incumplimiento de Horarios', 'Llegada tarde', false, false),
  (11, 'Adherencia y Asistencia', 'Incumplimiento de Horarios', 'Salida anticipada sin autorización', false, false),
  (12, 'Adherencia y Asistencia', 'Incumplimiento de Horarios', 'Ausencia injustificada', false, false),
  (13, 'Adherencia y Asistencia', 'Desviación en Pausas y Descansos', 'Exceso de tiempo en Break / Almuerzo / Baño', false, false),
  (14, 'Adherencia y Asistencia', 'Desviación en Pausas y Descansos', 'Uso de auxiliares incorrectos (ej. marcar «Formación» estando en baño)', false, false),
  -- Desempeño y Métricas (KPIs)
  (20, 'Desempeño y Métricas (KPIs)', 'Incumplimiento de Indicadores Operativos', 'Bajo índice de conversión: rendimiento por debajo de la cuota mínima de cierres', false, false),
  (21, 'Desempeño y Métricas (KPIs)', 'Incumplimiento de Indicadores Operativos', 'Incumplimiento de cuota/meta de ventas (unidades, contratos o valor)', false, false),
  (22, 'Desempeño y Métricas (KPIs)', 'Incumplimiento de Indicadores Operativos', 'Bajo promedio de cross-selling (productos adicionales, combos o ventas cruzadas)', false, false),
  (23, 'Desempeño y Métricas (KPIs)', 'Ética, Convivencia y Disciplina', 'Falta de respeto o insubordinación a un superior, par o cliente interno', false, false),
  (24, 'Desempeño y Métricas (KPIs)', 'Ética, Convivencia y Disciplina', 'Uso de lenguaje inapropiado, ofensivo o desacato de instrucciones', false, false),
  (25, 'Desempeño y Métricas (KPIs)', 'Ética, Convivencia y Disciplina', 'Acoso, hostigamiento o conductas contra el clima laboral', false, false),
  (26, 'Desempeño y Métricas (KPIs)', 'Ética, Convivencia y Disciplina', 'Incumplimiento del código de vestir o normas de convivencia del site/remoto', false, false),
  (27, 'Desempeño y Métricas (KPIs)', 'Ética, Convivencia y Disciplina', 'Manejo inadecuado o fuga de información confidencial / datos personales', false, false),
  (28, 'Desempeño y Métricas (KPIs)', 'Ética, Convivencia y Disciplina', 'Compartir credenciales, usuarios o contraseñas de acceso', false, false),
  -- Calidad
  (30, 'Calidad', 'Detección de Ítem Crítico', 'Corta o no contesta llamada', false, false),
  (31, 'Calidad', 'Detección de Ítem Crítico', 'Irrespetuoso con el cliente', false, false),
  (32, 'Calidad', 'Detección de Ítem Crítico', 'Transmite mala imagen de la compañía', false, false),
  (33, 'Calidad', 'Detección de Ítem Crítico', 'Omisión grave de información', false, false),
  (34, 'Calidad', 'Detección de Ítem Crítico', 'Miente al cliente', false, false),
  (35, 'Calidad', 'Detección de Ítem Crítico', 'No garantiza la lectura de la ATDP antes de validar datos sensibles', false, false),
  (36, 'Calidad', 'Detección de Ítem Crítico', 'Gestión fraudulenta', false, false),
  (37, 'Calidad', 'Detección de Ítem Crítico', 'Gestión incorrecta', false, false),
  (38, 'Calidad', 'Detección de Ítem Crítico', 'Tipificación', false, false),
  (40, 'Calidad', 'Oportunidad de Mejora (Error No Crítico)', 'Sondeo / diagnóstico incompleto de la solicitud', false, false),
  (41, 'Calidad', 'Oportunidad de Mejora (Error No Crítico)', 'Características y beneficios', false, false),
  (42, 'Calidad', 'Oportunidad de Mejora (Error No Crítico)', 'Rebate de objeciones', false, false),
  (43, 'Calidad', 'Oportunidad de Mejora (Error No Crítico)', 'Cierre', false, false),
  (44, 'Calidad', 'Reconocimiento Positivo', 'Gestión destacada de calidad y experiencia del cliente', false, true),
  -- Gestión de Liderazgo y Equipo (solo dirección y gerencia)
  (50, 'Gestión de Liderazgo y Equipo', 'Incumplimiento de Funciones', 'Incumplimiento de KPIs clave del rol', true, false),
  (51, 'Gestión de Liderazgo y Equipo', 'Incumplimiento de Funciones', 'Inconsistencia o retraso en la entrega de reportes o insumos operativos', true, false),
  (52, 'Gestión de Liderazgo y Equipo', 'Incumplimiento de Funciones', 'Falta de seguimiento o ejecución de planes de acción comprometidos', true, false),
  (53, 'Gestión de Liderazgo y Equipo', 'Incumplimiento de Objetivos de Campaña', 'Desviación sistemática de los KPIs globales del grupo a cargo', true, false),
  (54, 'Gestión de Liderazgo y Equipo', 'Incumplimiento de Objetivos de Campaña', 'Alta rotación o ausentismo no gestionado en su equipo', true, false),
  (55, 'Gestión de Liderazgo y Equipo', 'Desempeño Sobresaliente', 'Cumplimiento o superación de las métricas operativas del mes', true, true),
  (56, 'Gestión de Liderazgo y Equipo', 'Desempeño Sobresaliente', 'Propuesta e implementación de mejoras de procesos eficientes', true, true),
  (57, 'Gestión de Liderazgo y Equipo', 'Desempeño Sobresaliente', 'Excelente clima laboral / bajas tasas de rotación en su grupo', true, true)
) as v(orden, tipo, subtipo, detalle, dir, pos)
where public.area_modulo('feedback') is not null;

-- ---------- 9. QUIÉN ENTRA ----------
-- Lo pedido: Calidad y administradores. Mismo criterio que el cuadro de
-- Calidad: Carolina (editora) y Formación por persona, y el grupo Calidad.
insert into permisos_area (usuario_id, area_id, nivel)
select u.id, public.area_modulo('feedback'), 'edicion'::nivel_acceso
  from auth.users u
 where lower(u.email) in ('analista.calidad@voz360.co', 'formacion@voz360.co')
on conflict (usuario_id, area_id) do update set nivel = excluded.nivel;

insert into permisos_grupo (grupo_id, area_id, nivel)
select g.id, public.area_modulo('feedback'), 'edicion'::nivel_acceso
  from grupos g where g.slug = 'calidad'
on conflict (grupo_id, area_id) do update set nivel = excluded.nivel;

comment on table feedback is
  'Retroalimentación operativa a un colaborador según el catálogo. La conformidad solo pasa por responder_feedback(); el estado y el seguimiento los gestiona el cuadro.';
comment on table feedback_catalogo is
  'Catálogo de tipos y subtipos de feedback (documento Tipos y Subtipos de Feedback). Referencia legible por cualquier autenticado.';
