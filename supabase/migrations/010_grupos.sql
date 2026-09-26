-- =====================================================================
-- GRUPOS: PERMISOS POR SEGMENTO EN LUGAR DE PERSONA A PERSONA
-- =====================================================================
-- Con 57 cuentas, conceder acceso de una en una deja de ser viable: dar de
-- alta a un asesor son cuatro clics repetidos y, peor, olvidarse de uno no
-- se nota hasta que reclama. Un grupo reúne a las personas que hacen el
-- mismo trabajo, se le dan los permisos una vez y quien entra al grupo los
-- hereda al instante.
--
-- Los permisos personales NO desaparecen: siguen existiendo y conviven con
-- los del grupo. Gana el mayor de los dos. Esa es la regla importante, y es
-- la que hace que el grupo nunca le quite a nadie algo que ya tenía.
-- =====================================================================

-- ---------- 1. TABLAS ----------

create table grupos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  slug        text not null unique,
  descripcion text,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

comment on table grupos is
  'Segmentos de personas (asesores, calidad, gerencia…) a los que se conceden permisos en bloque.';

create table grupos_usuarios (
  grupo_id     uuid not null references grupos (id)   on delete cascade,
  usuario_id   uuid not null references perfiles (id) on delete cascade,
  agregado_por uuid references perfiles (id) on delete set null,
  agregado_en  timestamptz not null default now(),
  primary key (grupo_id, usuario_id)
);

create index idx_grupos_usuarios_usuario on grupos_usuarios (usuario_id);

create table permisos_grupo (
  grupo_id     uuid not null references grupos (id) on delete cascade,
  area_id      uuid not null references areas (id)  on delete cascade,
  nivel        nivel_acceso not null default 'lectura',
  otorgado_por uuid references perfiles (id) on delete set null,
  otorgado_en  timestamptz not null default now(),
  primary key (grupo_id, area_id)
);

create index idx_permisos_grupo_area on permisos_grupo (area_id);

-- ---------- 2. EL NIVEL, AHORA SUMANDO GRUPOS ----------
-- Gana el mayor entre lo personal y lo que den los grupos activos. Después
-- se aplica el techo del rol global, igual que antes.
--
-- El "when max(nivel) is null" no es decorativo: LEAST() en Postgres ignora
-- los NULL, así que sin esa rama una persona sin ningún permiso saldría con
-- 'descarga' por el simple hecho de ser lectora. Con la forma anterior el
-- caso no se daba, porque la subconsulta entera era NULL; al agregar con
-- max() siempre hay una fila, y hay que decidir qué significa vacía.
create or replace function public.nivel_en_area(a uuid)
returns nivel_acceso language sql security definer stable set search_path = public as $$
  select case
    when a is null then null
    when not exists (select 1 from areas where id = a and activa) then null
    when public.soy_admin() then 'total'::nivel_acceso
    when public.mi_rol() is null then null
    else (
      with concedido as (
        select pa.nivel
          from permisos_area pa
         where pa.usuario_id = auth.uid() and pa.area_id = a
        union all
        select pg.nivel
          from permisos_grupo pg
          join grupos_usuarios gu on gu.grupo_id = pg.grupo_id
          join grupos g          on g.id = pg.grupo_id and g.activo
         where gu.usuario_id = auth.uid() and pg.area_id = a
      )
      select case
               when max(nivel) is null then null
               when public.mi_rol() = 'lector'
                 then least(max(nivel), 'descarga'::nivel_acceso)
               else max(nivel)
             end
      from concedido
    )
  end;
$$;

-- ---------- 3. RLS ----------

alter table grupos          enable row level security;
alter table grupos_usuarios enable row level security;
alter table permisos_grupo  enable row level security;

-- Los nombres de los grupos los puede leer cualquiera con sesión: aparecen
-- en pantallas de administración y no revelan nada por sí mismos.
create policy grupos_select on grupos
  for select to authenticated using (true);

create policy grupos_admin_all on grupos
  for all to authenticated using (public.soy_admin()) with check (public.soy_admin());

-- Cada quien ve a qué grupos pertenece; el admin ve todas las membresías.
create policy grupos_usuarios_select on grupos_usuarios
  for select to authenticated
  using (usuario_id = auth.uid() or public.soy_admin());

create policy grupos_usuarios_admin_all on grupos_usuarios
  for all to authenticated using (public.soy_admin()) with check (public.soy_admin());

-- Los permisos de grupo solo los toca el admin. Leerlos también es suyo:
-- para la persona lo que cuenta es su nivel efectivo, que ya devuelve
-- nivel_en_area() sin necesidad de exponer la tabla entera.
create policy permisos_grupo_admin_all on permisos_grupo
  for all to authenticated using (public.soy_admin()) with check (public.soy_admin());

-- ---------- 4. LOS SEGMENTOS DE VOZ360 ----------
-- Nacen sin permisos sobre ninguna área: crear el grupo no concede nada.
-- Lo que se hereda se decide después, desde Administración → Grupos.
insert into grupos (nombre, slug, descripcion) values
  ('Asesores',       'asesores',       'Personal de operación que entra con su número de Poliedro.'),
  ('Team leaders',   'team-leaders',   'Responsables de equipo en la operación.'),
  ('Calidad',        'calidad',        'Aseguramiento de la calidad y sistema de gestión ISO 9001.'),
  ('Gerencia',       'gerencia',       'Dirección general y gerencia operativa.'),
  ('Administración', 'administracion', 'Procesos administrativos: gestión humana, formación y TI.')
on conflict (nombre) do nothing;
