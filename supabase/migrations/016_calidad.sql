-- =====================================================================
-- CALIDAD (QualityCore)
-- =====================================================================
-- Tercer cuadro-módulo, pedido por el Coordinador CX en el formulario de
-- requerimientos del 5 de octubre de 2026: unificar la matriz de calidad,
-- las auditorías, la retroalimentación con compromisos firmados por el
-- asesor y los reportes gerenciales, que hoy viven repartidos entre un
-- Google Forms y varias hojas de cálculo.
--
-- Piezas:
--   calidad_asesores            la estructura operativa: quién es asesor y de qué team leader
--   calidad_matrices / _items   la pauta: ítems por categoría, peso y si son error crítico
--   calidad_evaluaciones        una auditoría de una interacción, contra una matriz
--   calidad_respuestas          cumple / no cumple / no aplica por ítem, con hallazgo
--   calidad_retroalimentaciones la sesión de feedback de una evaluación, que el asesor firma
--   calidad_compromisos         los acuerdos con fecha límite y su seguimiento
--
-- La nota la calcula la vista v_calidad_evaluaciones, nunca la aplicación:
--   nota_sin_ic = peso de lo que cumple / peso de lo aplicable (sin errores críticos)
--   nota_final  = 0 si falla algún error crítico y la matriz así lo marca; si no, nota_sin_ic
--
-- Quién ve qué (RLS):
--   · con acceso al cuadro (nivel_en_area): todo el módulo
--   · un asesor: SUS evaluaciones publicadas, su retroalimentación y sus
--     compromisos, aunque no tenga el cuadro; y puede firmar
--   · la pauta (matrices e ítems) la lee cualquier autenticado: son los
--     criterios de calidad, no datos de personas
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
  check (modulo in ('evaluacion', 'cumpleanos', 'calidad'));

insert into areas (nombre, slug, descripcion, modulo)
values (
  'Calidad',
  'calidad',
  'Auditorías de calidad con la pauta parametrizada, retroalimentación firmada por el asesor y seguimiento de compromisos.',
  'calidad'
)
on conflict (nombre) do update set modulo = excluded.modulo;

create type calidad_resultado as enum ('cumple', 'no_cumple', 'no_aplica');

-- ---------- 2. ESTRUCTURA OPERATIVA ----------
-- Viene de la "Hoja 1" del consolidado de calidad. usuario_id enlaza con la
-- cuenta de la app cuando existe (los asesores entran con su Poliedro);
-- sin cuenta, la persona se puede auditar igual, pero no podrá firmar.
create table calidad_asesores (
  id                 uuid primary key default gen_random_uuid(),
  area_id            uuid not null references areas (id) on delete restrict,
  cedula             text unique,
  nombre             text not null,
  team_leader        text,
  campana            text,
  fecha_contratacion date,
  usuario_id         uuid unique references perfiles (id) on delete set null,
  activo             boolean not null default true,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);
create index calidad_asesores_tl on calidad_asesores (team_leader);
create trigger trg_calidad_asesores_actualizado
  before update on calidad_asesores for each row execute function public.tocar_actualizado_en();

-- ---------- 3. LA PAUTA ----------
create table calidad_matrices (
  id                 uuid primary key default gen_random_uuid(),
  area_id            uuid not null references areas (id) on delete restrict,
  nombre             text not null,
  descripcion        text,
  version            integer not null default 1,
  activa             boolean not null default true,
  -- Si falla un error crítico, la nota final es 0 (lo habitual en calidad de
  -- call center). Se puede desactivar por matriz.
  error_fatal_anula  boolean not null default true,
  -- Umbral de aprobación en porcentaje.
  nota_minima        numeric(5,2) not null default 85 check (nota_minima between 0 and 100),
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  unique (nombre, version)
);
create trigger trg_calidad_matrices_actualizado
  before update on calidad_matrices for each row execute function public.tocar_actualizado_en();

create table calidad_items (
  id          uuid primary key default gen_random_uuid(),
  matriz_id   uuid not null references calidad_matrices (id) on delete cascade,
  orden       integer not null,
  categoria   text not null,
  descripcion text not null,
  -- Peso en porcentaje. Los errores críticos no pesan: anulan.
  peso        numeric(6,2) not null default 0 check (peso >= 0),
  es_fatal    boolean not null default false,
  activo      boolean not null default true,
  unique (matriz_id, orden)
);

-- Los pesos de los ítems activos no críticos deben sumar 100. Se exige al
-- publicar una evaluación, no al editar la matriz: mientras se configura,
-- la suma puede estar a medias.
create or replace function public.calidad_pesos_suman_cien(m uuid)
returns boolean language sql stable as $$
  select abs(coalesce(sum(peso), 0) - 100) < 0.01
    from calidad_items where matriz_id = m and activo and not es_fatal
$$;

-- ---------- 4. EVALUACIONES ----------
create table calidad_evaluaciones (
  id                uuid primary key default gen_random_uuid(),
  area_id           uuid not null references areas (id) on delete restrict,
  matriz_id         uuid not null references calidad_matrices (id) on delete restrict,
  asesor_id         uuid not null references calidad_asesores (id) on delete restrict,
  asesor_nombre     text not null,              -- copiado: sobrevive a cambios de estructura
  team_leader       text,                       -- copiado al momento de auditar
  analista_id       uuid references perfiles (id) on delete set null,
  analista_nombre   text not null,
  fecha_interaccion date not null,
  fecha_auditoria   date not null default current_date,
  tipo              text not null default 'Venta',          -- Venta / No venta
  etapa             text,                                   -- Contratados / Seguimiento / OJT / PQR
  canal             text not null default 'llamada',
  referencia        text,                       -- id de la interacción, login, etc.
  duracion          text,
  detalle           text,                       -- "Detalle de llamada"
  puntos_mejora     text,
  estado            text not null default 'borrador' check (estado in ('borrador', 'publicada')),
  publicada_en      timestamptz,
  creado_por        uuid references perfiles (id) on delete set null,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);
create index calidad_evaluaciones_asesor on calidad_evaluaciones (asesor_id, fecha_interaccion desc);
create index calidad_evaluaciones_fecha on calidad_evaluaciones (fecha_auditoria desc);
create trigger trg_calidad_evaluaciones_actualizado
  before update on calidad_evaluaciones for each row execute function public.tocar_actualizado_en();

create table calidad_respuestas (
  evaluacion_id uuid not null references calidad_evaluaciones (id) on delete cascade,
  item_id       uuid not null references calidad_items (id) on delete restrict,
  resultado     calidad_resultado not null,
  hallazgo      text,
  primary key (evaluacion_id, item_id)
);

-- El ítem tiene que ser de la matriz de la evaluación.
create or replace function public.calidad_respuesta_coherente()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from calidad_evaluaciones e join calidad_items i on i.matriz_id = e.matriz_id
     where e.id = new.evaluacion_id and i.id = new.item_id
  ) then
    raise exception 'El ítem no pertenece a la matriz de la evaluación';
  end if;
  return new;
end $$;
create trigger trg_calidad_respuestas_coherentes
  before insert or update on calidad_respuestas
  for each row execute function public.calidad_respuesta_coherente();

-- Publicar exige: pesos que sumen 100 y todos los ítems activos respondidos.
-- Una vez publicada, la matriz y el asesor no cambian.
create or replace function public.calidad_publicacion_valida()
returns trigger language plpgsql as $$
begin
  if new.estado = 'publicada' and old.estado = 'borrador' then
    if not public.calidad_pesos_suman_cien(new.matriz_id) then
      raise exception 'La matriz no suma 100 %% en sus pesos; corrígela antes de publicar';
    end if;
    if exists (
      select 1 from calidad_items i
       where i.matriz_id = new.matriz_id and i.activo
         and not exists (select 1 from calidad_respuestas r where r.evaluacion_id = new.id and r.item_id = i.id)
    ) then
      raise exception 'Faltan ítems por responder';
    end if;
    new.publicada_en := now();
  end if;
  if old.estado = 'publicada' and (new.matriz_id <> old.matriz_id or new.asesor_id <> old.asesor_id) then
    raise exception 'Una evaluación publicada no cambia de matriz ni de asesor';
  end if;
  return new;
end $$;
create trigger trg_calidad_publicacion
  before update on calidad_evaluaciones
  for each row execute function public.calidad_publicacion_valida();

-- ---------- 5. RETROALIMENTACIÓN Y COMPROMISOS ----------
create table calidad_retroalimentaciones (
  id                   uuid primary key default gen_random_uuid(),
  evaluacion_id        uuid not null unique references calidad_evaluaciones (id) on delete cascade,
  area_id              uuid not null references areas (id) on delete restrict,
  realizada_por        uuid references perfiles (id) on delete set null,
  realizada_por_nombre text not null,
  fortalezas           text,
  oportunidades        text,
  comentarios_asesor   text,
  estado               text not null default 'pendiente' check (estado in ('pendiente', 'en_proceso', 'firmada')),
  firmada_en           timestamptz,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);
create trigger trg_calidad_retro_actualizado
  before update on calidad_retroalimentaciones for each row execute function public.tocar_actualizado_en();

create table calidad_compromisos (
  id             uuid primary key default gen_random_uuid(),
  retro_id       uuid not null references calidad_retroalimentaciones (id) on delete cascade,
  descripcion    text not null,
  fecha_limite   date not null,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'en_seguimiento', 'cumplido', 'no_cumplido')),
  avance         text,
  cerrado_en     timestamptz,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index calidad_compromisos_vencimiento on calidad_compromisos (fecha_limite) where estado in ('pendiente', 'en_seguimiento');
create trigger trg_calidad_compromisos_actualizado
  before update on calidad_compromisos for each row execute function public.tocar_actualizado_en();

-- La firma solo entra por firmar_retroalimentacion(): es el asesor quien
-- firma, nunca quien hizo la sesión. El disparador bloquea cualquier otro
-- camino al estado 'firmada'.
create or replace function public.calidad_firma_solo_por_funcion()
returns trigger language plpgsql as $$
begin
  if new.estado = 'firmada' and (old.estado is distinct from 'firmada')
     and current_setting('v360.firmando', true) is distinct from '1' then
    raise exception 'La retroalimentación la firma el asesor desde su pantalla';
  end if;
  return new;
end $$;
create trigger trg_calidad_firma
  before update on calidad_retroalimentaciones
  for each row execute function public.calidad_firma_solo_por_funcion();

create or replace function public.firmar_retroalimentacion(p_retro uuid, p_comentarios text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  r record;
begin
  select rt.id, rt.estado, a.usuario_id
    into r
    from calidad_retroalimentaciones rt
    join calidad_evaluaciones e on e.id = rt.evaluacion_id
    join calidad_asesores a on a.id = e.asesor_id
   where rt.id = p_retro;
  if r.id is null then raise exception 'No existe la retroalimentación'; end if;
  if r.usuario_id is null or r.usuario_id <> yo then
    raise exception 'Solo el asesor evaluado puede firmar su retroalimentación';
  end if;
  if r.estado = 'firmada' then raise exception 'Ya estaba firmada'; end if;
  if not exists (select 1 from calidad_compromisos c where c.retro_id = p_retro) then
    raise exception 'No se puede firmar sin al menos un compromiso de mejora';
  end if;
  perform set_config('v360.firmando', '1', true);
  update calidad_retroalimentaciones
     set estado = 'firmada', firmada_en = now(),
         comentarios_asesor = coalesce(nullif(trim(p_comentarios), ''), comentarios_asesor)
   where id = p_retro;
  insert into accesos (usuario_id, usuario_email, usuario_nombre, doc_titulo, area_nombre, accion)
  select yo, coalesce(u.email, ''), coalesce(p.nombre, ''), 'Firma de retroalimentación ' || p_retro::text, 'Calidad', 'editar'
    from perfiles p left join auth.users u on u.id = p.id where p.id = yo;
end $$;
grant execute on function public.firmar_retroalimentacion(uuid, text) to authenticated;

-- ---------- 6. LA NOTA ----------
create or replace view v_calidad_evaluaciones with (security_invoker = true) as
select e.*,
       m.nombre            as matriz_nombre,
       m.nota_minima,
       m.error_fatal_anula,
       t.n_items,
       t.n_respondidos,
       t.n_no_cumple,
       t.n_fatales_fallados,
       t.nota_sin_ic,
       case
         when t.nota_sin_ic is null then null
         when m.error_fatal_anula and t.n_fatales_fallados > 0 then 0
         else t.nota_sin_ic
       end as nota_final,
       case
         when t.nota_sin_ic is null then null
         when m.error_fatal_anula and t.n_fatales_fallados > 0 then false
         else t.nota_sin_ic >= m.nota_minima
       end as aprobada,
       rt.id     as retro_id,
       rt.estado as retro_estado
  from calidad_evaluaciones e
  join calidad_matrices m on m.id = e.matriz_id
  left join calidad_retroalimentaciones rt on rt.evaluacion_id = e.id
  cross join lateral (
    select count(i.id) filter (where i.activo)                                            as n_items,
           count(r.item_id)                                                                as n_respondidos,
           count(*) filter (where r.resultado = 'no_cumple')                               as n_no_cumple,
           count(*) filter (where r.resultado = 'no_cumple' and i.es_fatal)                as n_fatales_fallados,
           case when sum(i.peso) filter (where not i.es_fatal and r.resultado <> 'no_aplica') > 0
                then round(100 * sum(i.peso) filter (where not i.es_fatal and r.resultado = 'cumple')
                           / sum(i.peso) filter (where not i.es_fatal and r.resultado <> 'no_aplica'), 2)
           end                                                                             as nota_sin_ic
      from calidad_items i
      left join calidad_respuestas r on r.item_id = i.id and r.evaluacion_id = e.id
     where i.matriz_id = e.matriz_id
  ) t;

-- ---------- 7. ALERTAS ----------
-- Para quien llama: al asesor, sus evaluaciones publicadas y sus
-- retroalimentaciones pendientes de firma; a quien tiene el cuadro, los
-- compromisos que vencen en dos días. Idempotente por clave.
create or replace function public.generar_alertas_calidad()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  area uuid := public.area_modulo('calidad');
  pendientes integer;
begin
  if yo is null or area is null then return 0; end if;

  -- Como asesor
  insert into notificaciones (usuario_id, clave, tipo, titulo, cuerpo, enlace)
  select yo, 'calidad:eval:' || e.id, 'calidad',
         '📋 Nueva evaluación de calidad: ' || coalesce(v.nota_final::text, '—') || ' %',
         'Auditoría del ' || to_char(e.fecha_interaccion, 'DD/MM/YYYY') || ' por ' || e.analista_nombre,
         '/mis-evaluaciones'
    from calidad_evaluaciones e
    join calidad_asesores a on a.id = e.asesor_id
    join v_calidad_evaluaciones v on v.id = e.id
   where a.usuario_id = yo and e.estado = 'publicada'
  on conflict (usuario_id, clave) do nothing;

  insert into notificaciones (usuario_id, clave, tipo, titulo, cuerpo, enlace)
  select yo, 'calidad:firma:' || rt.id, 'calidad',
         '✍️ Retroalimentación pendiente de tu firma',
         'Sesión con ' || rt.realizada_por_nombre || '. Revisa los compromisos y firma.',
         '/mis-evaluaciones'
    from calidad_retroalimentaciones rt
    join calidad_evaluaciones e on e.id = rt.evaluacion_id
    join calidad_asesores a on a.id = e.asesor_id
   where a.usuario_id = yo and rt.estado <> 'firmada'
  on conflict (usuario_id, clave) do nothing;

  -- Como gestor del cuadro
  if public.nivel_en_area(area) is not null then
    insert into notificaciones (usuario_id, clave, tipo, titulo, cuerpo, enlace)
    select yo, 'calidad:vence:' || c.id || ':' || to_char(c.fecha_limite, 'YYYY-MM-DD'), 'calidad',
           case when c.fecha_limite < current_date then '⏰ Compromiso vencido: ' else '⏰ Compromiso por vencer: ' end || e.asesor_nombre,
           left(c.descripcion, 120) || ' · límite ' || to_char(c.fecha_limite, 'DD/MM/YYYY'),
           '/calidad/evaluaciones/' || e.id
      from calidad_compromisos c
      join calidad_retroalimentaciones rt on rt.id = c.retro_id
      join calidad_evaluaciones e on e.id = rt.evaluacion_id
     where c.estado in ('pendiente', 'en_seguimiento')
       and c.fecha_limite <= current_date + 2
    on conflict (usuario_id, clave) do nothing;
  end if;

  select count(*) into pendientes from notificaciones where usuario_id = yo and leida_en is null;
  return pendientes;
end $$;
grant execute on function public.generar_alertas_calidad() to authenticated;

-- ---------- 8. POLÍTICAS ----------
alter table calidad_asesores            enable row level security;
alter table calidad_matrices            enable row level security;
alter table calidad_items               enable row level security;
alter table calidad_evaluaciones        enable row level security;
alter table calidad_respuestas          enable row level security;
alter table calidad_retroalimentaciones enable row level security;
alter table calidad_compromisos         enable row level security;

-- ¿Soy el asesor de esta evaluación? (para las políticas de "lo mío")
create or replace function public.calidad_es_mi_evaluacion(ev uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from calidad_evaluaciones e join calidad_asesores a on a.id = e.asesor_id
     where e.id = ev and a.usuario_id = auth.uid() and e.estado = 'publicada'
  )
$$;
grant execute on function public.calidad_es_mi_evaluacion(uuid) to authenticated;

-- Estructura: la ve y la mantiene el cuadro; el asesor ve su propia fila.
create policy calidad_asesores_select on calidad_asesores for select to authenticated
  using (public.nivel_en_area(area_id) is not null or usuario_id = auth.uid());
create policy calidad_asesores_write on calidad_asesores for all to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion')
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('calidad'));

-- Pauta: lectura general; edición desde el cuadro.
create policy calidad_matrices_select on calidad_matrices for select to authenticated using (true);
create policy calidad_matrices_write on calidad_matrices for all to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion')
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('calidad'));
create policy calidad_items_select on calidad_items for select to authenticated using (true);
create policy calidad_items_write on calidad_items for all to authenticated
  using (exists (select 1 from calidad_matrices m where m.id = matriz_id and public.nivel_en_area(m.area_id) >= 'edicion'))
  with check (exists (select 1 from calidad_matrices m where m.id = matriz_id and public.nivel_en_area(m.area_id) >= 'edicion'));

-- Evaluaciones: el cuadro todo; el asesor, las suyas publicadas.
create policy calidad_evaluaciones_select on calidad_evaluaciones for select to authenticated
  using (public.nivel_en_area(area_id) is not null or public.calidad_es_mi_evaluacion(id));
create policy calidad_evaluaciones_insert on calidad_evaluaciones for insert to authenticated
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('calidad') and creado_por = auth.uid());
create policy calidad_evaluaciones_update on calidad_evaluaciones for update to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion')
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('calidad'));
create policy calidad_evaluaciones_delete on calidad_evaluaciones for delete to authenticated
  using (public.soy_admin() or public.nivel_en_area(area_id) = 'total');

create policy calidad_respuestas_select on calidad_respuestas for select to authenticated
  using (exists (select 1 from calidad_evaluaciones e where e.id = evaluacion_id));
create policy calidad_respuestas_write on calidad_respuestas for all to authenticated
  using (exists (select 1 from calidad_evaluaciones e where e.id = evaluacion_id and public.nivel_en_area(e.area_id) >= 'edicion' and (e.estado = 'borrador' or public.soy_admin())))
  with check (exists (select 1 from calidad_evaluaciones e where e.id = evaluacion_id and public.nivel_en_area(e.area_id) >= 'edicion' and (e.estado = 'borrador' or public.soy_admin())));

-- Retroalimentación: el cuadro la crea y la edita mientras no esté firmada;
-- el asesor la lee. Firmar solo por la función.
create policy calidad_retro_select on calidad_retroalimentaciones for select to authenticated
  using (public.nivel_en_area(area_id) is not null or public.calidad_es_mi_evaluacion(evaluacion_id));
create policy calidad_retro_insert on calidad_retroalimentaciones for insert to authenticated
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('calidad') and realizada_por = auth.uid());
create policy calidad_retro_update on calidad_retroalimentaciones for update to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion' and (estado <> 'firmada' or public.soy_admin()))
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('calidad'));
create policy calidad_retro_delete on calidad_retroalimentaciones for delete to authenticated
  using (public.soy_admin() or public.nivel_en_area(area_id) = 'total');

create policy calidad_compromisos_select on calidad_compromisos for select to authenticated
  using (exists (select 1 from calidad_retroalimentaciones rt where rt.id = retro_id));
create policy calidad_compromisos_write on calidad_compromisos for all to authenticated
  using (exists (select 1 from calidad_retroalimentaciones rt where rt.id = retro_id and public.nivel_en_area(rt.area_id) >= 'edicion'))
  with check (exists (select 1 from calidad_retroalimentaciones rt where rt.id = retro_id and public.nivel_en_area(rt.area_id) >= 'edicion'));

-- ---------- 9. QUIÉN ENTRA ----------
-- Lo pedido: administradores, Calidad y Luisa (Formación / Coordinación CX).
-- Carolina pasa a editora: con rol lector el techo es descarga y no podría
-- auditar. El grupo Calidad recibe edición para que quien se sume al
-- equipo herede el acceso.
insert into permisos_area (usuario_id, area_id, nivel)
select u.id, public.area_modulo('calidad'), 'edicion'::nivel_acceso
  from auth.users u
 where lower(u.email) in ('analista.calidad@voz360.co', 'formacion@voz360.co')
on conflict (usuario_id, area_id) do update set nivel = excluded.nivel;

insert into permisos_grupo (grupo_id, area_id, nivel)
select g.id, public.area_modulo('calidad'), 'edicion'::nivel_acceso
  from grupos g where g.slug = 'calidad'
on conflict (grupo_id, area_id) do update set nivel = excluded.nivel;

update perfiles set rol = 'editor'
 where rol = 'lector'
   and id in (select id from auth.users where lower(email) = 'analista.calidad@voz360.co');

comment on table calidad_evaluaciones is
  'Auditoría de calidad de una interacción contra una matriz. La nota está en v_calidad_evaluaciones.';
comment on table calidad_retroalimentaciones is
  'Sesión de feedback de una evaluación. El estado firmada solo se alcanza con firmar_retroalimentacion(), que ejecuta el asesor.';
