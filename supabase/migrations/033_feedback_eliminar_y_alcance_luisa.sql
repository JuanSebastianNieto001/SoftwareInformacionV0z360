-- =====================================================================
-- FEEDBACK: ELIMINAR CON MOTIVO Y BITÁCORA, Y ALCANCE DE FORMACIÓN
-- =====================================================================
-- 1. Igual que las auditorías (030): un feedback ya no se borra con un
--    DELETE directo, solo con eliminar_feedback(), que exige MOTIVO, nivel
--    Total EXPLÍCITO sobre el cuadro de Feedback (hoy solo Luisa, de
--    Formación) y deja una foto de lo borrado en feedback_eliminaciones y
--    rastro en accesos. Los administradores leen la bitácora.
--
-- 2. Luisa (formacion@) amplía su alcance: además de Carolina, puede dar
--    feedback a los asesores y a los team leaders.
-- =====================================================================

-- ---------- 1. QUIÉN PUEDE ELIMINAR ----------
create or replace function public.feedback_puede_eliminar()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from permisos_area pa
            where pa.usuario_id = auth.uid()
              and pa.area_id = public.area_modulo('feedback')
              and pa.nivel = 'total')
      or exists (
           select 1 from permisos_grupo pg
             join grupos_usuarios gu on gu.grupo_id = pg.grupo_id
             join grupos g on g.id = pg.grupo_id and g.activo
            where gu.usuario_id = auth.uid()
              and pg.area_id = public.area_modulo('feedback')
              and pg.nivel = 'total')
$$;
grant execute on function public.feedback_puede_eliminar() to authenticated;

-- ---------- 2. LA BITÁCORA ----------
create table feedback_eliminaciones (
  id                   uuid primary key default gen_random_uuid(),
  feedback_id          uuid not null,
  colaborador_nombre   text not null,
  team_leader          text,
  tipo                 text,
  subtipo              text,
  detalle              text,
  fecha                date,
  gravedad             text,
  estado               text,
  descripcion          text,
  compromiso           text,
  conformidad          text,
  registrado_por_nombre text,
  motivo               text not null check (char_length(motivo) between 10 and 1000),
  eliminado_por        uuid references perfiles (id) on delete set null,
  eliminado_por_nombre text not null default '',
  eliminado_en         timestamptz not null default now()
);
create index feedback_eliminaciones_fecha on feedback_eliminaciones (eliminado_en desc);

alter table feedback_eliminaciones enable row level security;
create policy feedback_eliminaciones_select on feedback_eliminaciones for select to authenticated
  using (public.soy_admin() or public.feedback_puede_eliminar());

comment on table feedback_eliminaciones is
  'Bitácora de feedback eliminado: foto de lo borrado, motivo, quién y cuándo. Solo la escribe eliminar_feedback().';

-- ---------- 3. ELIMINAR CON MOTIVO ----------
create or replace function public.eliminar_feedback(p_id uuid, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  v record;
  m text := trim(coalesce(p_motivo, ''));
begin
  if not public.feedback_puede_eliminar() then
    raise exception 'Solo la coordinación con nivel Total en Feedback puede eliminar feedback';
  end if;
  if char_length(m) < 10 then
    raise exception 'Escribe el motivo de la eliminación (mínimo 10 caracteres)';
  end if;

  select * into v from v_feedback where id = p_id;
  if v.id is null then raise exception 'No existe el feedback'; end if;

  insert into feedback_eliminaciones (feedback_id, colaborador_nombre, team_leader, tipo, subtipo, detalle,
         fecha, gravedad, estado, descripcion, compromiso, conformidad, registrado_por_nombre,
         motivo, eliminado_por, eliminado_por_nombre)
  values (v.id, v.colaborador_nombre, v.team_leader, v.tipo, v.subtipo, v.detalle,
         v.fecha, v.gravedad::text, v.estado::text, v.descripcion, v.plan_accion, v.conformidad::text,
         v.creado_por_nombre, m, yo, coalesce((select nombre from perfiles where id = yo), ''));

  insert into accesos (usuario_id, usuario_email, usuario_nombre, doc_titulo, area_nombre, accion)
  select yo, coalesce(u.email, ''), coalesce(p.nombre, ''),
         left('Elimina feedback · ' || v.colaborador_nombre || ' · ' || v.subtipo || ' · motivo: ' || m, 500),
         'Feedback', 'eliminar'
    from perfiles p left join auth.users u on u.id = p.id where p.id = yo;

  delete from feedback where id = p_id;
end $$;
grant execute on function public.eliminar_feedback(uuid, text) to authenticated;

-- Sin DELETE directo: el único camino es la función.
drop policy if exists feedback_delete on feedback;

-- ---------- 4. LUISA: TOTAL EN FEEDBACK Y ALCANCE AMPLIADO ----------
insert into permisos_area (usuario_id, area_id, nivel)
select u.id, public.area_modulo('feedback'), 'total'::nivel_acceso
  from auth.users u
 where lower(u.email) = 'formacion@voz360.co'
on conflict (usuario_id, area_id) do update set nivel = excluded.nivel;

-- Además de Carolina (ya cargada en la 026): asesores y team leaders.
insert into feedback_alcance (emisor_id, destino_tipo, destino_cargo, ve_todo)
select u.id, v.tipo, v.cargo, true
  from (values ('asesores', null::text), ('cargo', 'Team Leader')) as v(tipo, cargo)
  join auth.users u on lower(u.email) = 'formacion@voz360.co'
 where not exists (
   select 1 from feedback_alcance fa
    where fa.emisor_id = u.id and fa.destino_tipo = v.tipo
      and fa.destino_cargo is not distinct from v.cargo
 );
