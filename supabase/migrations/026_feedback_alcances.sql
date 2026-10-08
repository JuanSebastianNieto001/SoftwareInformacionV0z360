-- =====================================================================
-- FEEDBACK: QUIÉN PUEDE DARLE RETROALIMENTACIÓN A QUIÉN (ALCANCES)
-- =====================================================================
-- El módulo deja de ser solo de Calidad y administradores: cada emisor
-- tiene un ALCANCE (a quién puede registrarle feedback), definido por la
-- dirección y guardado en la base, no en el código:
--
--   - Dirección general (gerencia@) y dirección de operación
--     (gerencia.operativa@): a todos (team leaders, datamarshall, back
--     office, Calidad, Formación, TI, asesores, RRHH y Selección), y son
--     quienes pueden usar el tipo "Gestión de Liderazgo y Equipo".
--   - Líder de TI: administrador (a todos).
--   - Clemencia (gestionhumana@): a Alejandra Galvis (seleccion@).
--   - Luisa (formacion@): a Carolina (analista.calidad@).
--   - Carolina (analista.calidad@): a los asesores.
--   - Camilo (soporte@): a los asesores.
--   - Team leaders (team*.portabilidad@): solo a los asesores.
--   - Back office (backoffice*.portabilidad@): solo a los asesores.
--
-- Visibilidad: dirección, Calidad, Formación y administradores ven todo el
-- panel (ve_todo); los demás emisores ven solo lo que ellos registraron, y
-- cada colaborador lo suyo en «Mis feedback». El catálogo pasa a mantenerse
-- solo por administradores.
-- =====================================================================

-- ---------- 1. LA TABLA DE ALCANCES ----------
create table feedback_alcance (
  id                 uuid primary key default gen_random_uuid(),
  emisor_id          uuid not null references perfiles (id) on delete cascade,
  destino_tipo       text not null check (destino_tipo in ('todos', 'asesores', 'cargo', 'usuario')),
  destino_usuario_id uuid references perfiles (id) on delete cascade,
  destino_cargo      text check (char_length(destino_cargo) <= 80),
  -- Ve el panel completo (todas las filas), no solo lo que registró.
  ve_todo            boolean not null default false,
  creado_en          timestamptz not null default now(),
  check ((destino_tipo = 'usuario') = (destino_usuario_id is not null)),
  check ((destino_tipo = 'cargo') = (destino_cargo is not null))
);
create index feedback_alcance_emisor on feedback_alcance (emisor_id);

alter table feedback_alcance enable row level security;
-- Se lee para pintar el buscador de cada emisor; lo administra solo el admin.
create policy feedback_alcance_select on feedback_alcance for select to authenticated using (true);
create policy feedback_alcance_admin on feedback_alcance for all to authenticated
  using (public.soy_admin()) with check (public.soy_admin());

comment on table feedback_alcance is
  'A quién puede registrarle feedback cada emisor (todos / asesores / un cargo / una persona) y si ve el panel completo. Lo mantiene el administrador.';

-- ---------- 2. FUNCIONES DE ALCANCE ----------
create or replace function public.feedback_ve_todo()
returns boolean language sql stable security definer set search_path = public as $$
  select public.soy_admin()
      or exists (select 1 from feedback_alcance where emisor_id = auth.uid() and ve_todo)
$$;
grant execute on function public.feedback_ve_todo() to authenticated;

-- ¿Puedo registrarle feedback a esta persona? Se resuelve por cuenta
-- vinculada, por cargo del perfil o por pertenencia a la estructura de
-- asesores (también por nombre, para asesores aún sin cuenta).
create or replace function public.feedback_puede_emitir(p_usuario uuid, p_nombre text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.soy_admin()
      or exists (
        select 1 from feedback_alcance fa
         where fa.emisor_id = auth.uid()
           and (
             fa.destino_tipo = 'todos'
             or (fa.destino_tipo = 'usuario' and fa.destino_usuario_id = p_usuario)
             or (fa.destino_tipo = 'cargo' and p_usuario is not null and exists (
                   select 1 from perfiles pe where pe.id = p_usuario and lower(pe.cargo) = lower(fa.destino_cargo)))
             or (fa.destino_tipo = 'asesores' and (
                   exists (select 1 from calidad_asesores a where a.usuario_id is not null and a.usuario_id = p_usuario)
                or exists (select 1 from calidad_asesores a where lower(a.nombre) = lower(trim(coalesce(p_nombre, ''))))))
           )
      )
$$;
grant execute on function public.feedback_puede_emitir(uuid, text) to authenticated;

-- ---------- 3. EL DISPARADOR EXIGE EL ALCANCE ----------
create or replace function public.feedback_coherencia()
returns trigger language plpgsql set search_path = public as $$
declare
  v_solo_direccion boolean;
begin
  new.area_id := public.area_modulo('feedback');

  if tg_op = 'INSERT'
     or new.catalogo_id is distinct from old.catalogo_id
     or new.colaborador_usuario_id is distinct from old.colaborador_usuario_id
     or new.colaborador_nombre is distinct from old.colaborador_nombre then
    -- El tipo de liderazgo es de la dirección: administradores o quien
    -- tiene alcance 'todos' (las dos direcciones).
    select solo_direccion into v_solo_direccion from feedback_catalogo where id = new.catalogo_id;
    if coalesce(v_solo_direccion, false)
       and not (public.soy_admin() or exists (select 1 from feedback_alcance where emisor_id = auth.uid() and destino_tipo = 'todos')) then
      raise exception 'El feedback de liderazgo y equipo solo lo registra dirección o gerencia';
    end if;
    -- Y el destinatario debe estar dentro del alcance del emisor.
    if not public.feedback_puede_emitir(new.colaborador_usuario_id, new.colaborador_nombre) then
      raise exception 'Tu alcance de feedback no incluye a esta persona';
    end if;
  end if;

  if new.conformidad is not null and (tg_op = 'INSERT' or old.conformidad is distinct from new.conformidad) then
    new.conformidad_en := now();
  elsif new.conformidad is null then
    new.conformidad_en := null;
  end if;
  return new;
end $$;

-- ---------- 4. VISIBILIDAD POR ALCANCE ----------
drop policy if exists feedback_select on feedback;
create policy feedback_select on feedback for select to authenticated
  using (
    colaborador_usuario_id = auth.uid()
    or (public.nivel_en_area(area_id) is not null and (public.feedback_ve_todo() or creado_por = auth.uid()))
  );

drop policy if exists feedback_update on feedback;
create policy feedback_update on feedback for update to authenticated
  using (public.nivel_en_area(area_id) >= 'edicion' and (public.feedback_ve_todo() or creado_por = auth.uid()))
  with check (public.nivel_en_area(area_id) >= 'edicion' and area_id = public.area_modulo('feedback'));

-- El catálogo es institucional: lo mantiene el administrador.
drop policy if exists feedback_catalogo_write on feedback_catalogo;
create policy feedback_catalogo_write on feedback_catalogo for all to authenticated
  using (public.soy_admin()) with check (public.soy_admin());

-- ---------- 5. QUIÉN ENTRA Y CON QUÉ ALCANCE ----------
do $$
declare
  area uuid := public.area_modulo('feedback');
  emisores text[] := array[
    'gerencia@voz360.co', 'gerencia.operativa@voz360.co',
    'gestionhumana@voz360.co', 'formacion@voz360.co', 'analista.calidad@voz360.co',
    'soporte@voz360.co',
    'team.portabilidad@voz360.co', 'team2.portabilidad@voz360.co',
    'team3.portabilidad@voz360.co', 'team4.portabilidad@voz360.co',
    'backoffice.portabilidad@voz360.co', 'backoffice2.portabilidad@voz360.co'
  ];
begin
  if area is null then
    raise notice 'No hay área de feedback; no se cargan alcances.';
    return;
  end if;

  -- Todos los emisores entran al cuadro con Edición…
  insert into permisos_area (usuario_id, area_id, nivel)
  select u.id, area, 'edicion'::nivel_acceso
    from auth.users u
   where lower(u.email) = any (emisores)
  on conflict (usuario_id, area_id) do update set nivel = excluded.nivel;

  -- …y con rol Editor (un Lector tiene techo en Descarga y no podría registrar).
  update perfiles set rol = 'editor'
   where rol = 'lector'
     and id in (select id from auth.users where lower(email) = any (emisores));

  -- Alcances (se recargan completos: la fuente de verdad es esta lista).
  delete from feedback_alcance;
  insert into feedback_alcance (emisor_id, destino_tipo, destino_usuario_id, ve_todo)
  select u.id, v.tipo, du.id, v.ve_todo
    from (values
      -- Dirección general y de operación: a todos y ven todo el panel.
      ('gerencia@voz360.co',                'todos',    null,                         true),
      ('gerencia.operativa@voz360.co',      'todos',    null,                         true),
      -- Calidad y Formación gestionan el cuadro (ven todo); su emisión es acotada.
      ('analista.calidad@voz360.co',        'asesores', null,                         true),
      ('formacion@voz360.co',               'usuario',  'analista.calidad@voz360.co', true),
      -- RRHH: a la psicóloga de selección.
      ('gestionhumana@voz360.co',           'usuario',  'seleccion@voz360.co',        false),
      -- Soporte TI, team leaders y back office: solo a los asesores.
      ('soporte@voz360.co',                 'asesores', null,                         false),
      ('team.portabilidad@voz360.co',       'asesores', null,                         false),
      ('team2.portabilidad@voz360.co',      'asesores', null,                         false),
      ('team3.portabilidad@voz360.co',      'asesores', null,                         false),
      ('team4.portabilidad@voz360.co',      'asesores', null,                         false),
      ('backoffice.portabilidad@voz360.co', 'asesores', null,                         false),
      ('backoffice2.portabilidad@voz360.co','asesores', null,                         false)
    ) as v(email, tipo, destino_email, ve_todo)
    join auth.users u on lower(u.email) = v.email
    left join auth.users du on lower(du.email) = v.destino_email
   where v.tipo <> 'usuario' or du.id is not null;
end $$;
