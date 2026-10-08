-- =====================================================================
-- CALIDAD: PUBLICAR EN LOTE Y ELIMINAR CON MOTIVO Y BITÁCORA
-- =====================================================================
-- 1. Publicar en lote: quien audita guarda borradores y luego los publica
--    de un tirón (o uno por uno). La función corre con los permisos de
--    quien llama (RLS y el disparador de publicación validan cada una) y
--    devuelve, por auditoría, si se publicó o por qué no.
--
-- 2. Eliminar: ya no se borra una auditoría con un DELETE directo. Solo
--    por eliminar_auditoria_calidad(), que exige un MOTIVO y deja una foto
--    de lo borrado en calidad_eliminaciones (y en accesos). Puede hacerlo
--    quien tiene nivel Total EXPLÍCITO sobre el cuadro de Calidad, por
--    persona o por grupo — hoy, solo la coordinación de Formación (Luisa).
--    El administrador no borra por serlo: ve la bitácora.
-- =====================================================================

-- ---------- 1. PUBLICAR EN LOTE ----------
create or replace function public.publicar_borradores_calidad(p_ids uuid[] default null)
returns table (evaluacion_id uuid, asesor_nombre text, publicada boolean, motivo text)
language plpgsql
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select e.id, e.asesor_nombre
      from calidad_evaluaciones e
     where e.estado = 'borrador'
       and (case when p_ids is null then e.analista_id = auth.uid() else e.id = any (p_ids) end)
     order by e.fecha_auditoria, e.creado_en
  loop
    begin
      update calidad_evaluaciones set estado = 'publicada'
       where id = r.id and estado = 'borrador';
      if found then
        evaluacion_id := r.id; asesor_nombre := r.asesor_nombre; publicada := true; motivo := null;
      else
        evaluacion_id := r.id; asesor_nombre := r.asesor_nombre; publicada := false; motivo := 'Sin permiso para publicarla';
      end if;
    exception when others then
      evaluacion_id := r.id; asesor_nombre := r.asesor_nombre; publicada := false; motivo := sqlerrm;
    end;
    return next;
  end loop;
end $$;
grant execute on function public.publicar_borradores_calidad(uuid[]) to authenticated;

-- ---------- 2. QUIÉN PUEDE ELIMINAR ----------
create or replace function public.calidad_puede_eliminar()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from permisos_area pa
            where pa.usuario_id = auth.uid()
              and pa.area_id = public.area_modulo('calidad')
              and pa.nivel = 'total')
      or exists (
           select 1 from permisos_grupo pg
             join grupos_usuarios gu on gu.grupo_id = pg.grupo_id
             join grupos g on g.id = pg.grupo_id and g.activo
            where gu.usuario_id = auth.uid()
              and pg.area_id = public.area_modulo('calidad')
              and pg.nivel = 'total')
$$;
grant execute on function public.calidad_puede_eliminar() to authenticated;

-- ---------- 3. LA BITÁCORA ----------
create table calidad_eliminaciones (
  id                    uuid primary key default gen_random_uuid(),
  evaluacion_id         uuid not null,
  asesor_nombre         text not null,
  team_leader           text,
  analista_nombre       text,
  tipo                  text,
  fecha_interaccion     date,
  fecha_auditoria       date,
  estado                text,
  nota_final            numeric(5,2),
  nota_importada        numeric(5,2),
  n_respuestas          integer not null default 0,
  tenia_retro           boolean not null default false,
  motivo                text not null check (char_length(motivo) between 10 and 1000),
  eliminada_por         uuid references perfiles (id) on delete set null,
  eliminada_por_nombre  text not null default '',
  eliminada_en          timestamptz not null default now()
);
create index calidad_eliminaciones_fecha on calidad_eliminaciones (eliminada_en desc);

alter table calidad_eliminaciones enable row level security;
-- La leen los administradores y quien puede eliminar. Nadie la escribe
-- directamente: solo la función de abajo.
create policy calidad_eliminaciones_select on calidad_eliminaciones for select to authenticated
  using (public.soy_admin() or public.calidad_puede_eliminar());

comment on table calidad_eliminaciones is
  'Bitácora de auditorías de calidad eliminadas: foto de lo borrado, motivo, quién y cuándo. Solo la escribe eliminar_auditoria_calidad().';

-- ---------- 4. ELIMINAR CON MOTIVO ----------
create or replace function public.eliminar_auditoria_calidad(p_id uuid, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  v record;
  m text := trim(coalesce(p_motivo, ''));
begin
  if not public.calidad_puede_eliminar() then
    raise exception 'Solo la coordinación con nivel Total en Calidad puede eliminar auditorías';
  end if;
  if char_length(m) < 10 then
    raise exception 'Escribe el motivo de la eliminación (mínimo 10 caracteres)';
  end if;

  select e.id, e.asesor_nombre, e.team_leader, e.analista_nombre, e.tipo, e.fecha_interaccion,
         e.fecha_auditoria, e.estado, e.nota_final, e.nota_importada, e.retro_id,
         (select count(*) from calidad_respuestas r where r.evaluacion_id = e.id) as n_resp
    into v
    from v_calidad_evaluaciones e
   where e.id = p_id;
  if v.id is null then raise exception 'No existe la auditoría'; end if;

  insert into calidad_eliminaciones (evaluacion_id, asesor_nombre, team_leader, analista_nombre, tipo,
         fecha_interaccion, fecha_auditoria, estado, nota_final, nota_importada, n_respuestas, tenia_retro,
         motivo, eliminada_por, eliminada_por_nombre)
  select v.id, v.asesor_nombre, v.team_leader, v.analista_nombre, v.tipo, v.fecha_interaccion,
         v.fecha_auditoria, v.estado, v.nota_final, v.nota_importada, v.n_resp, v.retro_id is not null,
         m, yo, coalesce((select nombre from perfiles where id = yo), '');

  insert into accesos (usuario_id, usuario_email, usuario_nombre, doc_titulo, area_nombre, accion)
  select yo, coalesce(u.email, ''), coalesce(p.nombre, ''),
         left('Elimina auditoría · ' || v.asesor_nombre || ' · ' || to_char(v.fecha_interaccion, 'DD/MM/YYYY') || ' · motivo: ' || m, 500),
         'Calidad', 'eliminar'
    from perfiles p left join auth.users u on u.id = p.id where p.id = yo;

  delete from calidad_evaluaciones where id = p_id;
end $$;
grant execute on function public.eliminar_auditoria_calidad(uuid, text) to authenticated;

-- Sin DELETE directo: el único camino es la función, que deja motivo y foto.
drop policy if exists calidad_evaluaciones_delete on calidad_evaluaciones;

-- ---------- 5. LUISA (COORDINACIÓN DE FORMACIÓN) CON TOTAL ----------
insert into permisos_area (usuario_id, area_id, nivel)
select u.id, public.area_modulo('calidad'), 'total'::nivel_acceso
  from auth.users u
 where lower(u.email) = 'formacion@voz360.co'
on conflict (usuario_id, area_id) do update set nivel = excluded.nivel;
