-- =====================================================================
-- CALIDAD: RANKING PÚBLICO DE ASESORES DEL MES EN CURSO
-- =====================================================================
-- El ranking se publica para todo el personal, pero solo el del mes en
-- curso (Colombia) y solo con agregados: posición, promedio, número de
-- auditorías y aprobadas. Ningún detalle de llamadas, hallazgos ni
-- retroalimentación sale de aquí: eso sigue protegido por RLS.
--
-- Cada asesor ve además cuál es su fila (es_yo). Solo cuentan las
-- auditorías publicadas; los borradores no.
-- =====================================================================

create or replace function public.ranking_calidad_mes()
returns table (
  posicion      integer,
  asesor_id     uuid,
  asesor_nombre text,
  team_leader   text,
  promedio      numeric,
  auditorias    integer,
  aprobadas     integer,
  con_critico   integer,
  es_yo         boolean
)
language sql stable security definer
set search_path = public
as $$
  with mes as (
    select date_trunc('month', (now() at time zone 'America/Bogota'))::date as desde
  ),
  agregado as (
    select e.asesor_id,
           max(e.asesor_nombre)                                   as asesor_nombre,
           max(e.team_leader)                                     as team_leader,
           round(avg(e.nota_final), 1)                            as promedio,
           count(*)::int                                          as auditorias,
           count(*) filter (where e.aprobada)::int                as aprobadas,
           count(*) filter (where e.n_fatales_fallados > 0)::int  as con_critico
      from v_calidad_evaluaciones e, mes
     where e.estado = 'publicada'
       and e.nota_final is not null
       and e.fecha_auditoria >= mes.desde
       and e.fecha_auditoria < (mes.desde + interval '1 month')::date
     group by e.asesor_id
  )
  select rank() over (order by a.promedio desc, a.auditorias desc)::int,
         a.asesor_id, a.asesor_nombre, a.team_leader, a.promedio,
         a.auditorias, a.aprobadas, a.con_critico,
         coalesce(ca.usuario_id = auth.uid(), false)
    from agregado a
    left join calidad_asesores ca on ca.id = a.asesor_id
   where auth.uid() is not null
   order by 1, a.asesor_nombre
$$;
grant execute on function public.ranking_calidad_mes() to authenticated;

comment on function public.ranking_calidad_mes() is
  'Ranking de asesores del mes en curso (Colombia): solo agregados de auditorías publicadas. Visible para todo el personal autenticado.';

-- ---------- Ajuste de la 031 ----------
-- La regla «la fecha de auditoría solo la cambia quien auditó» es para las
-- personas que usan la app (con sesión). Las tareas de mantenimiento sin
-- usuario (guiones con la clave de servicio) no pasan por PostgREST como
-- personas, así que no se les aplica: antes quedaban bloqueadas.
create or replace function public.calidad_fechas()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.fecha_interaccion := (now() at time zone 'America/Bogota')::date;
    return new;
  end if;

  -- La interacción no se cambia nunca después de registrada.
  new.fecha_interaccion := old.fecha_interaccion;

  -- La fecha de auditoría la cambia solo quien audita (o un administrador).
  if new.fecha_auditoria is distinct from old.fecha_auditoria
     and auth.uid() is not null
     and not (coalesce(old.analista_id = auth.uid(), false) or public.soy_admin()) then
    raise exception 'Solo quien hizo la auditoría puede cambiar su fecha';
  end if;
  return new;
end $$;
