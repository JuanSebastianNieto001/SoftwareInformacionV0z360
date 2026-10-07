-- =====================================================================
-- PDA: PLAN DEL ÁREA DE TI CON INDICADORES MEDIBLES
-- =====================================================================
-- Cuarto cuadro-módulo. Cada mes el líder de TI registra su PDA: un plan
-- con indicadores, cada uno con una meta. Durante el mes se registran
-- mediciones desde la misma pantalla y al final se ve, indicador por
-- indicador y para el plan completo, si se alcanzó la meta.
--
-- Quién entra lo decide la matriz de permisos, como en cualquier cuadro:
--   - Soporte técnico: Vista (consulta).
--   - Líder de TI: Edición (crea el PDA, los indicadores y mide).
--   - Administradores: todo, sin necesidad de asignación.
-- Borrar un PDA o un indicador exige Total (o ser administrador). Borrar
-- una medición equivocada basta con Edición: es corregir, no destruir.
--
-- El cálculo (resultado, avance, si cumple) vive en las vistas, para que
-- la pantalla, el resumen histórico y cualquier exportación digan lo mismo.
-- =====================================================================

-- ---------- 1. EL CUADRO ----------
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = 'public.areas'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%modulo%'
  loop
    execute format('alter table public.areas drop constraint %I', r.conname);
  end loop;
end $$;
alter table areas add constraint areas_modulo_check
  check (modulo in ('evaluacion', 'cumpleanos', 'calidad', 'pda'));

insert into areas (nombre, slug, descripcion, modulo)
values (
  'PDA',
  'pda',
  'Plan del área de TI: indicadores del mes, mediciones y cumplimiento de metas. Solo líder de TI, soporte y administradores.',
  'pda'
)
on conflict (nombre) do update set modulo = excluded.modulo;

create type pda_sentido as enum ('mayor', 'menor');          -- mayor: la meta es un mínimo; menor: un máximo
create type pda_agregacion as enum ('ultimo', 'suma', 'promedio');
create type pda_estado as enum ('abierto', 'cerrado');

-- ---------- 2. EL PDA DEL MES ----------
-- Uno por mes. `periodo` es siempre el día 1 del mes.
create table pda_planes (
  id             uuid primary key default gen_random_uuid(),
  area_id        uuid not null references areas (id) on delete restrict,
  periodo        date not null check (extract(day from periodo) = 1),
  titulo         text not null check (char_length(titulo) between 2 and 200),
  objetivo       text check (char_length(objetivo) <= 2000),
  estado         pda_estado not null default 'abierto',
  creado_por     uuid references perfiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (area_id, periodo)
);

create trigger trg_pda_planes_actualizado
  before update on pda_planes
  for each row execute function public.tocar_actualizado_en();

-- ---------- 3. INDICADORES ----------
create table pda_indicadores (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references pda_planes (id) on delete cascade,
  area_id        uuid not null references areas (id) on delete restrict,
  orden          smallint not null default 0,
  nombre         text not null check (char_length(nombre) between 2 and 200),
  descripcion    text check (char_length(descripcion) <= 2000),
  responsable    text check (char_length(responsable) <= 120),
  unidad         text not null default '%' check (char_length(unidad) between 1 and 30),
  sentido        pda_sentido not null default 'mayor',
  meta           numeric not null check (meta >= 0),
  agregacion     pda_agregacion not null default 'ultimo',
  peso           numeric not null default 1 check (peso > 0 and peso <= 100),
  creado_por     uuid references perfiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index pda_indicadores_plan on pda_indicadores (plan_id, orden);

create trigger trg_pda_indicadores_actualizado
  before update on pda_indicadores
  for each row execute function public.tocar_actualizado_en();

-- ---------- 4. MEDICIONES ----------
create table pda_mediciones (
  id             uuid primary key default gen_random_uuid(),
  indicador_id   uuid not null references pda_indicadores (id) on delete cascade,
  area_id        uuid not null references areas (id) on delete restrict,
  fecha          date not null,
  valor          numeric not null,
  observacion    text check (char_length(observacion) <= 1000),
  registrado_por uuid references perfiles (id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index pda_mediciones_indicador on pda_mediciones (indicador_id, fecha);

-- ---------- 5. COHERENCIA ----------
-- El área de un indicador es la de su plan, y la de una medición la de su
-- indicador: se copia del padre y no se acepta otra. Además, un PDA
-- cerrado queda congelado: para corregirlo hay que reabrirlo primero, y
-- eso queda a la vista en `actualizado_en` del plan.
create or replace function public.pda_coherencia()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_area uuid;
  v_estado pda_estado;
  v_plan uuid;
begin
  if tg_table_name = 'pda_indicadores' then
    v_plan := coalesce(new.plan_id, old.plan_id);
    if tg_op = 'UPDATE' and new.plan_id <> old.plan_id then
      raise exception 'Un indicador no cambia de PDA';
    end if;
  else
    if tg_op = 'UPDATE' and new.indicador_id <> old.indicador_id then
      raise exception 'Una medición no cambia de indicador';
    end if;
    select i.plan_id into v_plan from pda_indicadores i
     where i.id = coalesce(new.indicador_id, old.indicador_id);
  end if;

  select p.area_id, p.estado into v_area, v_estado from pda_planes p where p.id = v_plan;

  if v_estado = 'cerrado' then
    raise exception 'El PDA está cerrado; reábrelo para modificarlo';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.area_id := v_area;
  return new;
end $$;

create trigger trg_pda_indicadores_coherencia
  before insert or update or delete on pda_indicadores
  for each row execute function public.pda_coherencia();

create trigger trg_pda_mediciones_coherencia
  before insert or update or delete on pda_mediciones
  for each row execute function public.pda_coherencia();

-- ---------- 6. CÁLCULO ----------
-- Resultado según la agregación del indicador. Avance en porcentaje
-- respecto a la meta (puede pasar de 100 cuando se supera); `cumple` es la
-- comparación directa con la meta. Sin mediciones no hay resultado ni
-- veredicto: null, no cero.
create or replace view v_pda_indicadores with (security_invoker = true) as
with agregado as (
  select i.id,
         count(m.id)::int as mediciones,
         max(m.fecha) as ultima_fecha,
         case i.agregacion
           when 'suma' then sum(m.valor)
           when 'promedio' then avg(m.valor)
           else (array_agg(m.valor order by m.fecha desc, m.creado_en desc))[1]
         end as resultado
    from pda_indicadores i
    left join pda_mediciones m on m.indicador_id = i.id
   group by i.id
)
select i.*,
       a.mediciones,
       a.ultima_fecha,
       case when a.mediciones = 0 then null else a.resultado end as resultado,
       case
         when a.mediciones = 0 then null
         when i.sentido = 'mayor' then a.resultado >= i.meta
         else a.resultado <= i.meta
       end as cumple,
       case
         when a.mediciones = 0 then null
         when i.sentido = 'mayor' then
           case when i.meta = 0 then 100 else round(a.resultado / i.meta * 100, 1) end
         else
           case when a.resultado <= i.meta then 100
                when a.resultado = 0 then 100
                else round(i.meta / a.resultado * 100, 1) end
       end as avance
  from pda_indicadores i
  join agregado a on a.id = i.id;

-- Resumen por PDA. `cumplimiento` es el promedio ponderado del avance de
-- los indicadores, cada uno topado en 100 para que superar uno no tape
-- otro que falló; los no medidos cuentan como 0. La meta del PDA se da
-- por alcanzada cuando todos sus indicadores cumplen.
create or replace view v_pda_planes with (security_invoker = true) as
select p.*,
       count(v.id)::int                                   as indicadores,
       count(v.id) filter (where v.mediciones > 0)::int   as medidos,
       count(v.id) filter (where v.cumple)::int           as cumplen,
       case when count(v.id) = 0 then null
            else round(sum(v.peso * least(coalesce(v.avance, 0), 100)) / sum(v.peso), 1)
       end                                                as cumplimiento,
       (count(v.id) > 0 and count(v.id) filter (where v.cumple) = count(v.id)) as meta_alcanzada
  from pda_planes p
  left join v_pda_indicadores v on v.plan_id = p.id
 group by p.id;

-- ---------- 7. RLS ----------
alter table pda_planes enable row level security;
alter table pda_indicadores enable row level security;
alter table pda_mediciones enable row level security;

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

create policy pda_indicadores_select on pda_indicadores
  for select to authenticated
  using (public.nivel_en_area(area_id) is not null);
create policy pda_indicadores_insert on pda_indicadores
  for insert to authenticated
  with check (
    public.nivel_en_area(area_id) >= 'edicion'
    and area_id = public.area_modulo('pda')
    and creado_por = auth.uid()
  );
create policy pda_indicadores_update on pda_indicadores
  for update to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion')
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('pda'));
create policy pda_indicadores_delete on pda_indicadores
  for delete to authenticated
  using (public.soy_admin() or public.nivel_en_area(area_id) = 'total');

create policy pda_mediciones_select on pda_mediciones
  for select to authenticated
  using (public.nivel_en_area(area_id) is not null);
create policy pda_mediciones_insert on pda_mediciones
  for insert to authenticated
  with check (
    public.nivel_en_area(area_id) >= 'edicion'
    and area_id = public.area_modulo('pda')
    and registrado_por = auth.uid()
  );
create policy pda_mediciones_update on pda_mediciones
  for update to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion')
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('pda'));
create policy pda_mediciones_delete on pda_mediciones
  for delete to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion');

-- ---------- 8. QUIÉN ENTRA ----------
-- Soporte consulta. El líder de TI se asigna con Edición desde
-- Administración → Permisos (su rol global debe ser Editor: un Lector no
-- pasa de Descarga). Si su correo se conoce, puede añadirse aquí con
-- nivel 'edicion'.
insert into permisos_area (usuario_id, area_id, nivel)
select u.id, public.area_modulo('pda'), v.nivel::nivel_acceso
  from (values
    ('soporte@voz360.co', 'lectura')
  ) as v (email, nivel)
  join auth.users u on lower(u.email) = v.email
on conflict (usuario_id, area_id) do update set nivel = excluded.nivel;

comment on table pda_planes is
  'PDA del área de TI: uno por mes. Resumen y cumplimiento en v_pda_planes.';
comment on table pda_indicadores is
  'Indicadores de un PDA con su meta. Resultado, avance y cumple en v_pda_indicadores.';
comment on table pda_mediciones is
  'Mediciones de un indicador durante el mes. Se consolidan según pda_indicadores.agregacion.';
