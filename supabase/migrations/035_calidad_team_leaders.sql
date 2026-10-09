-- =====================================================================
-- CALIDAD: LOS TEAM LEADERS AUDITAN A SU EQUIPO
-- =====================================================================
-- Los team leaders crean, completan y publican auditorías, pero SOLO de
-- los asesores que tienen a cargo, y solo ven lo de su equipo: las
-- auditorías publicadas de sus asesores y lo que ellos mismos registraron.
-- No configuran la pauta ni la estructura, no hacen la retroalimentación
-- (sigue siendo de Calidad) y no eliminan.
--
-- Quién es team leader de quién: calidad_asesores.team_leader guarda el
-- NOMBRE del team leader tal como venía del consolidado («Braian David
-- Delgado Alvarez»), que no coincide letra por letra con el de su cuenta
-- («Braian David Delgado»). calidad_team_leaders enlaza ese nombre con la
-- cuenta. Un asesor nuevo con ese team leader entra solo en su equipo.
-- El enlace lo hace un administrador: equivale a conceder acceso a datos
-- de desempeño de personas.
--
-- Todo se AÑADE como políticas permisivas nuevas, que Postgres une con OR
-- a las existentes: lo que ya ven y hacen Calidad, el asesor y el
-- administrador no cambia. Las listas del equipo se calculan una vez por
-- consulta (InitPlan), como en la 027.
-- =====================================================================

-- ---------- 1. EL ENLACE NOMBRE ↔ CUENTA ----------
create table calidad_team_leaders (
  nombre      text primary key,           -- tal cual en calidad_asesores.team_leader
  usuario_id  uuid not null references perfiles (id) on delete cascade,
  creado_en   timestamptz not null default now()
);
create index calidad_team_leaders_usuario on calidad_team_leaders (usuario_id);

comment on table calidad_team_leaders is
  'Qué cuenta es el team leader que aparece con este nombre en calidad_asesores.team_leader. Da acceso a auditar a ese equipo.';

alter table calidad_team_leaders enable row level security;
create policy calidad_team_leaders_select on calidad_team_leaders for select to authenticated
  using (
    (select public.nivel_en_area(public.area_modulo('calidad'))) is not null
    or usuario_id = (select auth.uid())
  );
create policy calidad_team_leaders_insert on calidad_team_leaders for insert to authenticated
  with check (public.soy_admin());
create policy calidad_team_leaders_update on calidad_team_leaders for update to authenticated
  using (public.soy_admin()) with check (public.soy_admin());
create policy calidad_team_leaders_delete on calidad_team_leaders for delete to authenticated
  using (public.soy_admin());

-- ---------- 2. EL EQUIPO DE QUIEN LLAMA ----------
-- security definer: leen la estructura sin depender de lo que RLS deja ver
-- y devuelven solo identificadores. Un perfil desactivado no tiene equipo.

-- Nombres de team leader enlazados a quien llama (normalmente uno).
create or replace function public.calidad_mis_nombres_tl()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(t.nombre), '{}')
    from calidad_team_leaders t
    join perfiles p on p.id = t.usuario_id and p.activo
   where t.usuario_id = auth.uid()
$$;

create or replace function public.calidad_soy_team_leader()
returns boolean language sql stable security definer set search_path = public as $$
  select cardinality(public.calidad_mis_nombres_tl()) > 0
$$;

-- Asesores que hoy están a cargo de quien llama.
create or replace function public.calidad_mis_asesores()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(a.id), '{}')
    from calidad_asesores a
   where a.team_leader = any (public.calidad_mis_nombres_tl())
$$;

-- Auditorías que el team leader puede consultar: las publicadas de su
-- equipo (el de hoy, o el team leader con el que se auditó) y las suyas.
-- La usan las tablas hijas (respuestas, retroalimentación, compromisos);
-- calidad_evaluaciones aplica la misma regla fila a fila (ver abajo).
create or replace function public.calidad_auditorias_de_mi_equipo()
returns uuid[] language sql stable security definer set search_path = public as $$
  with yo as (select public.calidad_mis_nombres_tl() as nombres, public.calidad_mis_asesores() as asesores)
  select coalesce(array_agg(e.id), '{}')
    from calidad_evaluaciones e, yo
   where cardinality(yo.nombres) > 0
     and (e.creado_por = auth.uid()
          or (e.estado = 'publicada' and (e.team_leader = any (yo.nombres) or e.asesor_id = any (yo.asesores))))
$$;

grant execute on function public.calidad_mis_nombres_tl() to authenticated;
grant execute on function public.calidad_soy_team_leader() to authenticated;
grant execute on function public.calidad_mis_asesores() to authenticated;
grant execute on function public.calidad_auditorias_de_mi_equipo() to authenticated;

-- ---------- 3. ENTRAR AL CUADRO ----------
-- El cuadro de Calidad aparece en «Mis áreas» del team leader y la app lo
-- deja entrar con alcance de equipo (no tiene nivel sobre el cuadro).
create policy areas_select_team_leader_calidad on areas for select to authenticated
  using (modulo = 'calidad' and (select public.calidad_soy_team_leader()));

-- ---------- 4. LEER LO DEL EQUIPO ----------
create policy calidad_asesores_select_tl on calidad_asesores for select to authenticated
  using (id = any ((select public.calidad_mis_asesores())::uuid[]));

-- Fila a fila (no con la lista) para que el INSERT … RETURNING de una
-- auditoría nueva la vea: la lista se calcula al empezar la sentencia.
create policy calidad_evaluaciones_select_tl on calidad_evaluaciones for select to authenticated
  using (
    (select public.calidad_soy_team_leader())
    and (
      creado_por = (select auth.uid())
      or (estado = 'publicada'
          and (team_leader = any ((select public.calidad_mis_nombres_tl())::text[])
               or asesor_id = any ((select public.calidad_mis_asesores())::uuid[])))
    )
  );

create policy calidad_respuestas_select_tl on calidad_respuestas for select to authenticated
  using (evaluacion_id = any ((select public.calidad_auditorias_de_mi_equipo())::uuid[]));

create policy calidad_retro_select_tl on calidad_retroalimentaciones for select to authenticated
  using (evaluacion_id = any ((select public.calidad_auditorias_de_mi_equipo())::uuid[]));

create policy calidad_compromisos_select_tl on calidad_compromisos for select to authenticated
  using (exists (
    select 1 from calidad_retroalimentaciones rt
     where rt.id = retro_id
       and rt.evaluacion_id = any ((select public.calidad_auditorias_de_mi_equipo())::uuid[])
  ));

-- ---------- 5. AUDITAR A SU EQUIPO ----------
-- Nace como borrador (publicar pasa por el disparador que exige la pauta
-- completa), a nombre de quien la hace y de un asesor de su equipo.
create policy calidad_evaluaciones_insert_tl on calidad_evaluaciones for insert to authenticated
  with check (
    area_id = public.area_modulo('calidad')
    and estado = 'borrador'
    and creado_por = (select auth.uid())
    and analista_id = (select auth.uid())
    and asesor_id = any ((select public.calidad_mis_asesores())::uuid[])
  );

-- Edita y publica solo las suyas, y el asesor sigue siendo de su equipo.
create policy calidad_evaluaciones_update_tl on calidad_evaluaciones for update to authenticated
  using (creado_por = (select auth.uid()) and asesor_id = any ((select public.calidad_mis_asesores())::uuid[]))
  with check (
    creado_por = (select auth.uid())
    and area_id = public.area_modulo('calidad')
    and asesor_id = any ((select public.calidad_mis_asesores())::uuid[])
  );

-- La pauta de sus borradores, mientras sean borradores.
create policy calidad_respuestas_insert_tl on calidad_respuestas for insert to authenticated
  with check (exists (
    select 1 from calidad_evaluaciones e
     where e.id = evaluacion_id and e.estado = 'borrador'
       and e.creado_por = (select auth.uid())
       and e.asesor_id = any ((select public.calidad_mis_asesores())::uuid[])
  ));
create policy calidad_respuestas_update_tl on calidad_respuestas for update to authenticated
  using (exists (
    select 1 from calidad_evaluaciones e
     where e.id = evaluacion_id and e.estado = 'borrador'
       and e.creado_por = (select auth.uid())
       and e.asesor_id = any ((select public.calidad_mis_asesores())::uuid[])
  ))
  with check (exists (
    select 1 from calidad_evaluaciones e
     where e.id = evaluacion_id and e.estado = 'borrador'
       and e.creado_por = (select auth.uid())
       and e.asesor_id = any ((select public.calidad_mis_asesores())::uuid[])
  ));
create policy calidad_respuestas_delete_tl on calidad_respuestas for delete to authenticated
  using (exists (
    select 1 from calidad_evaluaciones e
     where e.id = evaluacion_id and e.estado = 'borrador'
       and e.creado_por = (select auth.uid())
       and e.asesor_id = any ((select public.calidad_mis_asesores())::uuid[])
  ));

-- ---------- 6. LOS CUATRO TEAM LEADERS DE HOY ----------
insert into calidad_team_leaders (nombre, usuario_id)
select v.nombre, u.id
  from (values
    ('Braian David Delgado Alvarez',  'team3.portabilidad@voz360.co'),
    ('Carlos Fernando Velez Agudelo', 'team4.portabilidad@voz360.co'),
    ('Kelmer Eduardo Santiago Pion',  'team2.portabilidad@voz360.co'),
    ('Marko Stevan Velez Agudelo',    'team.portabilidad@voz360.co')
  ) as v(nombre, correo)
  join auth.users u on lower(u.email) = v.correo
on conflict (nombre) do nothing;
