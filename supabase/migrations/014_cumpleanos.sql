-- =====================================================================
-- CUMPLEAÑOS Y NOTIFICACIONES
-- =====================================================================
-- Segundo cuadro-módulo: la lista de cumpleaños que Gestión Humana lleva
-- en CUMPLEAÑOS VOZ 360 PORLIDER.xlsx, con alerta un día antes de cada
-- fecha para quienes tienen acceso al cuadro.
--
-- Dos decisiones:
--
-- 1. El módulo es un área, como el de evaluación (areas.modulo =
--    'cumpleanos'). Quién ve los cumpleaños lo decide la matriz de
--    permisos, no una lista de correos en el código.
--
-- 2. Las alertas se generan al entrar, no con un reloj. No hay forma de
--    avisar a quien no está en la aplicación (eso sería correo o push,
--    fuera de alcance), así que lo honesto es: cada vez que alguien con
--    acceso al cuadro carga una pantalla, se le crean las notificaciones
--    que le falten para los cumpleaños de mañana y de hoy. Es idempotente
--    por (usuario, clave): recargar no duplica.
-- =====================================================================

-- ---------- 1. EL CUADRO ----------
-- El check de `modulo` admite ahora dos valores. Se localiza por su
-- definición y no por su nombre, para no depender de cómo lo bautizó
-- Postgres en la migración 012.
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
  check (modulo in ('evaluacion', 'cumpleanos'));

insert into areas (nombre, slug, descripcion, modulo)
values (
  'Cumpleaños',
  'cumpleanos',
  'Cumpleaños del personal por team leader, con alerta un día antes. El acceso se concede desde Administración → Permisos.',
  'cumpleanos'
)
on conflict (nombre) do update set modulo = excluded.modulo;

-- Generaliza area_evaluacion(): el área de cualquier módulo por su marca.
create or replace function public.area_modulo(m text)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from areas where modulo = m and activa limit 1
$$;
grant execute on function public.area_modulo(text) to authenticated;

-- ---------- 2. CUMPLEAÑOS ----------
-- Día y mes siempre; el año solo cuando el libro lo trae (la sección
-- "Estructura" tiene las fechas con un año de relleno). usuario_id enlaza
-- con la cuenta de la app cuando el nombre coincide con un perfil; si no,
-- la fila vale igual: el cumpleaños es de la persona, no de la cuenta.
create table cumpleanos (
  id               uuid primary key default gen_random_uuid(),
  area_id          uuid not null references areas (id) on delete restrict,
  nombre           text not null,
  usuario_id       uuid references perfiles (id) on delete set null,
  grupo            text not null,                    -- 'Estructura' o el team leader
  team_leader      text,                             -- null en Estructura
  cumple_mes       smallint not null check (cumple_mes between 1 and 12),
  cumple_dia       smallint not null check (cumple_dia between 1 and 31),
  anio_nacimiento  smallint check (anio_nacimiento between 1900 and 2100),
  activo           boolean not null default true,
  notas            text,
  creado_por       uuid references perfiles (id) on delete set null,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);
create index cumpleanos_fecha on cumpleanos (cumple_mes, cumple_dia);
create index cumpleanos_grupo on cumpleanos (grupo);

create trigger trg_cumpleanos_actualizado
  before update on cumpleanos
  for each row execute function public.tocar_actualizado_en();

-- Próxima ocurrencia de un día/mes a partir de hoy. El 29 de febrero cae
-- el 28 en los años que no lo tienen.
create or replace function public.proximo_cumple(mes int, dia int, desde date default current_date)
returns date
language plpgsql immutable
as $$
declare
  anio int := extract(year from desde)::int;
  f date;
begin
  for i in 0..1 loop
    begin
      f := make_date(anio + i, mes, dia);
    exception when others then
      f := make_date(anio + i, mes, 28);
    end;
    if f >= desde then return f; end if;
  end loop;
  return f;
end $$;

create or replace view v_cumpleanos with (security_invoker = true) as
select c.*,
       public.proximo_cumple(c.cumple_mes, c.cumple_dia) as proximo,
       (public.proximo_cumple(c.cumple_mes, c.cumple_dia) - current_date) as dias_faltan,
       case when c.anio_nacimiento is not null
            then extract(year from public.proximo_cumple(c.cumple_mes, c.cumple_dia))::int - c.anio_nacimiento
       end as edad_que_cumple,
       p.nombre as usuario_nombre
  from cumpleanos c
  left join perfiles p on p.id = c.usuario_id;

alter table cumpleanos enable row level security;

create policy cumpleanos_select on cumpleanos
  for select to authenticated
  using (public.nivel_en_area(area_id) is not null);

create policy cumpleanos_insert on cumpleanos
  for insert to authenticated
  with check (
    public.nivel_en_area(area_id) >= 'edicion'
    and area_id = public.area_modulo('cumpleanos')
    and creado_por = auth.uid()
  );

create policy cumpleanos_update on cumpleanos
  for update to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion')
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('cumpleanos'));

create policy cumpleanos_delete on cumpleanos
  for delete to authenticated
  using (public.soy_admin() or public.nivel_en_area(area_id) = 'total');

-- ---------- 3. NOTIFICACIONES ----------
-- Cada fila es de una persona. Nadie las inserta a mano: las crean
-- funciones SECURITY DEFINER. Marcarlas como leídas sí es cosa de cada uno.
create table notificaciones (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfiles (id) on delete cascade,
  clave      text not null,                           -- idempotencia: 'cumple:<id>:<fecha>'
  tipo       text not null,                           -- 'cumpleanos'
  titulo     text not null,
  cuerpo     text,
  enlace     text,
  leida_en   timestamptz,
  creado_en  timestamptz not null default now(),
  unique (usuario_id, clave)
);
create index notificaciones_pendientes on notificaciones (usuario_id, creado_en desc) where leida_en is null;

alter table notificaciones enable row level security;

create policy notificaciones_select_propias on notificaciones
  for select to authenticated
  using (usuario_id = auth.uid());

-- Solo se puede cambiar leida_en: el resto de columnas queda como estaba.
create policy notificaciones_leer_propias on notificaciones
  for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- Genera, para quien llama, las alertas que le falten: cumpleaños de
-- mañana ("un día antes", lo pedido) y de hoy. Solo si tiene acceso al
-- cuadro. Devuelve cuántas quedan sin leer, para pintar la campana.
create or replace function public.generar_alertas_cumpleanos()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  area uuid := public.area_modulo('cumpleanos');
  pendientes integer;
begin
  if yo is null or area is null or public.nivel_en_area(area) is null then
    return 0;
  end if;

  insert into notificaciones (usuario_id, clave, tipo, titulo, cuerpo, enlace)
  select yo,
         'cumple:' || c.id || ':' || to_char(public.proximo_cumple(c.cumple_mes, c.cumple_dia), 'YYYY-MM-DD'),
         'cumpleanos',
         case when public.proximo_cumple(c.cumple_mes, c.cumple_dia) = current_date
              then '🎂 Hoy cumple años ' || c.nombre
              else '🎉 Mañana cumple años ' || c.nombre end,
         case when c.team_leader is not null then 'Equipo de ' || c.team_leader else c.grupo end
           || case when c.anio_nacimiento is not null
                   then ' · cumple ' || (extract(year from public.proximo_cumple(c.cumple_mes, c.cumple_dia))::int - c.anio_nacimiento) || ' años'
                   else '' end,
         '/cumpleanos'
    from cumpleanos c
   where c.activo
     and c.area_id = area
     and public.proximo_cumple(c.cumple_mes, c.cumple_dia) between current_date and current_date + 1
  on conflict (usuario_id, clave) do nothing;

  select count(*) into pendientes from notificaciones where usuario_id = yo and leida_en is null;
  return pendientes;
end $$;
grant execute on function public.generar_alertas_cumpleanos() to authenticated;

-- ---------- 4. QUIÉN ENTRA ----------
-- Lo pedido: administradores, Clemencia (Gestión Humana) y Alejandra
-- Galvis (Selección). Clemencia ve; Alejandra, que ya es editora,
-- mantiene la lista.
insert into permisos_area (usuario_id, area_id, nivel)
select u.id, public.area_modulo('cumpleanos'), v.nivel::nivel_acceso
  from (values
    ('gestionhumana@voz360.co', 'lectura'),
    ('seleccion@voz360.co',     'edicion')
  ) as v (email, nivel)
  join auth.users u on lower(u.email) = v.email
on conflict (usuario_id, area_id) do update set nivel = excluded.nivel;

comment on table cumpleanos is
  'Cumpleaños del personal (CUMPLEAÑOS VOZ 360 PORLIDER.xlsx). Próxima fecha y edad en v_cumpleanos; alertas en generar_alertas_cumpleanos().';
comment on table notificaciones is
  'Avisos dentro de la aplicación, uno por persona. Los crean funciones definer; cada quien marca los suyos como leídos.';
