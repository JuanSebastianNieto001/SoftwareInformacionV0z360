-- =====================================================================
-- PDA: EL PLAN DE TRABAJO MENSUAL DE TI, CON EL FORMATO FTM-SINF-005
-- =====================================================================
-- Reemplaza el modelo de la 018 (indicadores numéricos con mediciones),
-- que no llegó a usarse: la base no tenía filas. El PDA real del área es
-- la matriz de 14 columnas que se entrega cada mes a la Gerencia, una por
-- responsable (Líder de TI y Soporte TI). Cada fila es un objetivo con su
-- indicador, el indicador del mes anterior, el objetivo cualitativo, el
-- análisis de causa raíz, qué se hará, cómo, con qué recursos, la
-- periodicidad, el responsable y la proyección de cumplimiento; al cierre
-- del mes se completan los datos finales, el % de cumplimiento y la
-- observación.
--
-- Lo que hoy vive en carpetas de Drive pasa a la base:
--   - la lista de chequeo de cada objetivo (actividades con fecha límite,
--     como el checklist del plan de julio), que se va marcando;
--   - las evidencias de cada objetivo (pantallazos, informes, actas), en
--     un bucket privado `pda` cuyo acceso decide el mismo permiso del
--     cuadro.
--
-- Quién entra lo decide la matriz de permisos, como en cualquier cuadro:
--   - Soporte técnico: Vista (consulta).
--   - Líder de TI: Edición (crea el PDA, los objetivos, marca y sube).
--   - Administradores: todo.
-- Borrar un PDA o un objetivo exige Total (o ser administrador). Borrar
-- una actividad o una evidencia equivocada basta con Edición: es
-- corregir, no destruir. Un PDA cerrado queda congelado hasta reabrirlo.
-- =====================================================================

-- ---------- 0. RETIRAR EL MODELO DE LA 018 ----------
drop view if exists v_pda_planes;
drop view if exists v_pda_indicadores;
drop table if exists pda_mediciones;
drop table if exists pda_indicadores;
drop table if exists pda_planes;
drop function if exists public.pda_coherencia();
drop type if exists pda_sentido;
drop type if exists pda_agregacion;
-- pda_estado (abierto | cerrado) se conserva.

-- ---------- 1. EL PDA DEL MES ----------
-- Uno por mes y por cargo (Líder de TI, Soporte TI). `periodo` es siempre
-- el día 1 del mes. La cabecera recoge lo que lleva el documento "Plan de
-- trabajo": código y versión del formato, antecedentes, objetivo general
-- y entregables.
create table pda_planes (
  id               uuid primary key default gen_random_uuid(),
  area_id          uuid not null references areas (id) on delete restrict,
  periodo          date not null check (extract(day from periodo) = 1),
  cargo            text not null check (char_length(cargo) between 2 and 80),
  responsable      text not null check (char_length(responsable) between 2 and 160),
  responsable_id   uuid references perfiles (id) on delete set null,
  titulo           text not null check (char_length(titulo) between 2 and 300),
  codigo           text not null default 'FTM-SINF-005' check (char_length(codigo) between 2 and 40),
  version          text not null default '1.0' check (char_length(version) between 1 and 20),
  antecedentes     text check (char_length(antecedentes) <= 6000),
  objetivo_general text check (char_length(objetivo_general) <= 4000),
  entregables      text check (char_length(entregables) <= 4000),
  estado           pda_estado not null default 'abierto',
  cerrado_en       timestamptz,
  creado_por       uuid references perfiles (id) on delete set null,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  unique (area_id, periodo, cargo)
);

create trigger trg_pda_planes_actualizado
  before update on pda_planes
  for each row execute function public.tocar_actualizado_en();

-- Cerrar deja la fecha; reabrir la borra.
create or replace function public.pda_marcar_cierre()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.estado = 'cerrado' and (old.estado is distinct from 'cerrado') then
    new.cerrado_en := now();
  elsif new.estado = 'abierto' then
    new.cerrado_en := null;
  end if;
  return new;
end $$;

create trigger trg_pda_planes_cierre
  before update of estado on pda_planes
  for each row execute function public.pda_marcar_cierre();

-- ---------- 2. OBJETIVOS: LAS FILAS DE LA MATRIZ ----------
create table pda_objetivos (
  id                 uuid primary key default gen_random_uuid(),
  plan_id            uuid not null references pda_planes (id) on delete cascade,
  area_id            uuid not null references areas (id) on delete restrict,
  orden              smallint not null default 0,
  frente             text check (char_length(frente) <= 200),
  fecha_inicial      date,
  indicador          text not null check (char_length(indicador) between 2 and 1000),
  indicador_anterior text check (char_length(indicador_anterior) <= 1000),
  objetivo           text check (char_length(objetivo) <= 3000),
  causa_raiz         text check (char_length(causa_raiz) <= 3000),
  que_se_hara        text check (char_length(que_se_hara) <= 3000),
  como_se_hara       text check (char_length(como_se_hara) <= 3000),
  recursos           text check (char_length(recursos) <= 2000),
  periodicidad       text check (char_length(periodicidad) <= 1000),
  responsable        text check (char_length(responsable) <= 160),
  proyeccion         numeric(5,2) not null default 100 check (proyeccion between 0 and 100),
  datos_cierre       text check (char_length(datos_cierre) <= 3000),
  cumplimiento       numeric(5,2) check (cumplimiento between 0 and 100),
  observacion        text check (char_length(observacion) <= 3000),
  creado_por         uuid references perfiles (id) on delete set null,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);
create index pda_objetivos_plan on pda_objetivos (plan_id, orden);

create trigger trg_pda_objetivos_actualizado
  before update on pda_objetivos
  for each row execute function public.tocar_actualizado_en();

-- ---------- 3. LISTA DE CHEQUEO ----------
create table pda_tareas (
  id             uuid primary key default gen_random_uuid(),
  objetivo_id    uuid not null references pda_objetivos (id) on delete cascade,
  area_id        uuid not null references areas (id) on delete restrict,
  orden          smallint not null default 0,
  descripcion    text not null check (char_length(descripcion) between 2 and 500),
  fecha_limite   date,
  completada     boolean not null default false,
  completada_en  timestamptz,
  completada_por uuid references perfiles (id) on delete set null,
  observacion    text check (char_length(observacion) <= 1000),
  creado_por     uuid references perfiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index pda_tareas_objetivo on pda_tareas (objetivo_id, orden);

create trigger trg_pda_tareas_actualizado
  before update on pda_tareas
  for each row execute function public.tocar_actualizado_en();

-- Quién marcó y cuándo lo pone la base, no el cliente.
create or replace function public.pda_marcar_tarea()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.completada and (tg_op = 'INSERT' or not old.completada) then
    new.completada_en := now();
    new.completada_por := auth.uid();
  elsif not new.completada then
    new.completada_en := null;
    new.completada_por := null;
  end if;
  return new;
end $$;

create trigger trg_pda_tareas_marcar
  before insert or update of completada on pda_tareas
  for each row execute function public.pda_marcar_tarea();

-- ---------- 4. EVIDENCIAS ----------
-- Metadatos; el binario va al bucket `pda` en <plan_id>/<objetivo_id>/<archivo>.
create table pda_evidencias (
  id             uuid primary key default gen_random_uuid(),
  objetivo_id    uuid not null references pda_objetivos (id) on delete cascade,
  area_id        uuid not null references areas (id) on delete restrict,
  storage_path   text not null unique check (char_length(storage_path) <= 400),
  nombre_archivo text not null check (char_length(nombre_archivo) between 1 and 180),
  mime           text not null check (char_length(mime) <= 120),
  tamano_bytes   bigint not null check (tamano_bytes >= 0),
  descripcion    text check (char_length(descripcion) <= 500),
  subido_por     uuid references perfiles (id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index pda_evidencias_objetivo on pda_evidencias (objetivo_id, creado_en);

-- ---------- 5. COHERENCIA ----------
-- El área de un objetivo es la de su plan, y la de una tarea o evidencia la
-- de su objetivo: se copia del padre y no se acepta otra. Un objetivo no
-- cambia de plan ni una tarea o evidencia de objetivo. Un PDA cerrado
-- queda congelado: para corregirlo hay que reabrirlo. Cuando el plan se
-- está borrando (cascada), ya no existe y no bloquea nada.
create or replace function public.pda_coherencia()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_plan uuid;
  v_objetivo uuid;
  v_area uuid;
  v_estado pda_estado;
begin
  if tg_table_name = 'pda_objetivos' then
    v_plan := coalesce(new.plan_id, old.plan_id);
    if tg_op = 'UPDATE' and new.plan_id <> old.plan_id then
      raise exception 'Un objetivo no cambia de PDA';
    end if;
  else
    v_objetivo := coalesce(new.objetivo_id, old.objetivo_id);
    if tg_op = 'UPDATE' and new.objetivo_id <> old.objetivo_id then
      raise exception 'No se puede mover a otro objetivo';
    end if;
    select o.plan_id into v_plan from pda_objetivos o where o.id = v_objetivo;
  end if;

  select p.area_id, p.estado into v_area, v_estado from pda_planes p where p.id = v_plan;

  if v_estado = 'cerrado' then
    raise exception 'El PDA está cerrado; reábrelo para modificarlo';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if v_area is not null then
    new.area_id := v_area;
  end if;

  -- La ruta en Storage debe colgar del plan y del objetivo: así la política
  -- del bucket y la fila hablan del mismo archivo. (Anidado: plpgsql
  -- resuelve new.storage_path aunque la primera condición sea falsa.)
  if tg_table_name = 'pda_evidencias' then
    if new.storage_path not like v_plan::text || '/' || v_objetivo::text || '/%' then
      raise exception 'La evidencia debe guardarse en la carpeta de su objetivo';
    end if;
  end if;

  return new;
end $$;

create trigger trg_pda_objetivos_coherencia
  before insert or update or delete on pda_objetivos
  for each row execute function public.pda_coherencia();
create trigger trg_pda_tareas_coherencia
  before insert or update or delete on pda_tareas
  for each row execute function public.pda_coherencia();
create trigger trg_pda_evidencias_coherencia
  before insert or update or delete on pda_evidencias
  for each row execute function public.pda_coherencia();

-- ---------- 6. CÁLCULO ----------
-- Por objetivo: cuántas actividades hay y cuántas están hechas, cuántas
-- evidencias, y el avance de la lista de chequeo. El % de cumplimiento lo
-- escribe quien cierra el objetivo (columna M del formato); no se deduce.
create or replace view v_pda_objetivos with (security_invoker = true) as
select o.*,
       t.n_tareas,
       t.n_tareas_hechas,
       t.n_tareas_vencidas,
       e.n_evidencias,
       e.ultima_evidencia,
       case when t.n_tareas = 0 then null
            else round(100.0 * t.n_tareas_hechas / t.n_tareas, 1) end as avance_tareas
  from pda_objetivos o
  cross join lateral (
    select count(*)::int                                                                  as n_tareas,
           count(*) filter (where x.completada)::int                                      as n_tareas_hechas,
           count(*) filter (where not x.completada and x.fecha_limite < current_date)::int as n_tareas_vencidas
      from pda_tareas x where x.objetivo_id = o.id
  ) t
  cross join lateral (
    select count(*)::int as n_evidencias, max(y.creado_en) as ultima_evidencia
      from pda_evidencias y where y.objetivo_id = o.id
  ) e;

-- Por PDA: el cumplimiento es el promedio del % de cumplimiento de los
-- objetivos ya cerrados (como la columna M del formato), la proyección el
-- promedio de la columna K, y el avance de actividades sobre el total.
create or replace view v_pda_planes with (security_invoker = true) as
select p.*,
       count(v.id)::int                                            as n_objetivos,
       count(v.id) filter (where v.cumplimiento is not null)::int  as n_objetivos_cerrados,
       count(v.id) filter (where v.cumplimiento >= 100)::int       as n_objetivos_cumplidos,
       coalesce(sum(v.n_tareas), 0)::int                           as n_tareas,
       coalesce(sum(v.n_tareas_hechas), 0)::int                    as n_tareas_hechas,
       coalesce(sum(v.n_tareas_vencidas), 0)::int                  as n_tareas_vencidas,
       coalesce(sum(v.n_evidencias), 0)::int                       as n_evidencias,
       case when count(v.id) = 0 then null else round(avg(v.proyeccion), 1) end as proyeccion,
       round(avg(v.cumplimiento), 1)                               as cumplimiento,
       case when coalesce(sum(v.n_tareas), 0) = 0 then null
            else round(100.0 * sum(v.n_tareas_hechas) / sum(v.n_tareas), 1) end as avance_tareas
  from pda_planes p
  left join v_pda_objetivos v on v.plan_id = p.id
 group by p.id;

-- ---------- 7. RLS ----------
alter table pda_planes     enable row level security;
alter table pda_objetivos  enable row level security;
alter table pda_tareas     enable row level security;
alter table pda_evidencias enable row level security;

create policy pda_planes_select on pda_planes
  for select to authenticated
  using (public.nivel_en_area(area_id) is not null);
create policy pda_planes_insert on pda_planes
  for insert to authenticated
  with check (
    public.nivel_en_area(area_id) >= 'edicion'
    and area_id = public.area_modulo('pda')
    and creado_por = auth.uid()
  );
create policy pda_planes_update on pda_planes
  for update to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion')
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('pda'));
create policy pda_planes_delete on pda_planes
  for delete to authenticated
  using (public.soy_admin() or public.nivel_en_area(area_id) = 'total');

create policy pda_objetivos_select on pda_objetivos
  for select to authenticated
  using (public.nivel_en_area(area_id) is not null);
create policy pda_objetivos_insert on pda_objetivos
  for insert to authenticated
  with check (
    public.nivel_en_area(area_id) >= 'edicion'
    and area_id = public.area_modulo('pda')
    and creado_por = auth.uid()
  );
create policy pda_objetivos_update on pda_objetivos
  for update to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion')
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('pda'));
create policy pda_objetivos_delete on pda_objetivos
  for delete to authenticated
  using (public.soy_admin() or public.nivel_en_area(area_id) = 'total');

create policy pda_tareas_select on pda_tareas
  for select to authenticated
  using (public.nivel_en_area(area_id) is not null);
create policy pda_tareas_insert on pda_tareas
  for insert to authenticated
  with check (
    public.nivel_en_area(area_id) >= 'edicion'
    and area_id = public.area_modulo('pda')
    and creado_por = auth.uid()
  );
create policy pda_tareas_update on pda_tareas
  for update to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion')
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('pda'));
create policy pda_tareas_delete on pda_tareas
  for delete to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion');

create policy pda_evidencias_select on pda_evidencias
  for select to authenticated
  using (public.nivel_en_area(area_id) is not null);
create policy pda_evidencias_insert on pda_evidencias
  for insert to authenticated
  with check (
    public.nivel_en_area(area_id) >= 'edicion'
    and area_id = public.area_modulo('pda')
    and subido_por = auth.uid()
  );
create policy pda_evidencias_update on pda_evidencias
  for update to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion')
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('pda'));
create policy pda_evidencias_delete on pda_evidencias
  for delete to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion');

-- ---------- 8. BUCKET PRIVADO `pda` ----------
-- Pantallazos, informes y actas de cada objetivo. 25 MB por archivo. El
-- acceso es el del cuadro: quien lo ve, descarga; quien edita, sube y
-- retira. Nunca se sirve por URL pública: la app firma URLs de 60 s.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pda', 'pda', false, 26214400,
  array[
    'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do nothing;

create policy storage_select_pda on storage.objects
  for select to authenticated
  using (bucket_id = 'pda' and public.nivel_en_area(public.area_modulo('pda')) is not null);
create policy storage_insert_pda on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pda' and public.nivel_en_area(public.area_modulo('pda')) >= 'edicion');
create policy storage_update_pda on storage.objects
  for update to authenticated
  using (bucket_id = 'pda' and public.nivel_en_area(public.area_modulo('pda')) >= 'edicion');
create policy storage_delete_pda on storage.objects
  for delete to authenticated
  using (bucket_id = 'pda' and public.nivel_en_area(public.area_modulo('pda')) >= 'edicion');

-- ---------- 9. QUIÉN ENTRA ----------
-- Soporte consulta. El líder de TI se asigna con Edición desde
-- Administración → Permisos (su rol global debe ser Editor). Si la cuenta
-- de soporte aún no existe, el join no inserta nada y se asigna después.
insert into permisos_area (usuario_id, area_id, nivel)
select u.id, public.area_modulo('pda'), 'lectura'::nivel_acceso
  from auth.users u
 where lower(u.email) = 'soporte@voz360.co'
on conflict (usuario_id, area_id) do update set nivel = excluded.nivel;

comment on table pda_planes is
  'PDA (plan de trabajo) de TI: uno por mes y por cargo. Formato FTM-SINF-005. Resumen en v_pda_planes.';
comment on table pda_objetivos is
  'Filas de la matriz del PDA: indicador, objetivo, causa raíz, qué/cómo/recursos, periodicidad, proyección y cierre (datos, % cumplimiento, observación).';
comment on table pda_tareas is
  'Lista de chequeo de un objetivo: actividades con fecha límite que se van marcando durante el mes.';
comment on table pda_evidencias is
  'Pruebas de un objetivo (pantallazos, informes, actas). Binario en el bucket privado pda: <plan_id>/<objetivo_id>/<archivo>.';
