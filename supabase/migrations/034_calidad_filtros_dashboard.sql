-- =====================================================================
-- CALIDAD: CONTEOS POR MES Y LISTA DE AUDITORES PARA EL DASHBOARD
-- =====================================================================
-- El dashboard muestra cuántas auditorías publicadas hay en cada mes (en
-- las pastillas) y filtra por auditor (Carolina, Luisa y quienes auditaron
-- en el formulario anterior). Se calcula en la base para no depender del
-- tope de filas por petición. Ambas funciones corren con los permisos de
-- quien llama (security invoker): RLS decide qué cuenta.
-- =====================================================================

create or replace function public.calidad_auditores()
returns table (auditor text, auditorias integer)
language sql stable
set search_path = public
as $$
  select e.analista_nombre, count(*)::int
    from calidad_evaluaciones e
   where e.estado = 'publicada' and coalesce(trim(e.analista_nombre), '') <> ''
   group by e.analista_nombre
   order by e.analista_nombre
$$;
grant execute on function public.calidad_auditores() to authenticated;

create or replace function public.calidad_conteo_meses(p_auditor text default null, p_team_leader text default null)
returns table (mes text, auditorias integer)
language sql stable
set search_path = public
as $$
  select to_char(e.fecha_auditoria, 'YYYY-MM'), count(*)::int
    from calidad_evaluaciones e
   where e.estado = 'publicada'
     and (p_auditor is null or e.analista_nombre = p_auditor)
     and (p_team_leader is null or e.team_leader = p_team_leader)
   group by 1
   order by 1
$$;
grant execute on function public.calidad_conteo_meses(text, text) to authenticated;
