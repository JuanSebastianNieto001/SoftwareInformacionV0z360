-- =====================================================================
-- CALIDAD: POLÍTICAS DE LECTURA EN TIEMPO CONSTANTE
-- =====================================================================
-- El dashboard con «mes: todo» caducaba por statement timeout: leer las
-- 535 auditorías obligaba a evaluar nivel_en_area() fila por fila, y la
-- política de calidad_respuestas re-comprobaba la de calidad_evaluaciones
-- por cada una de las ~15.000 respuestas de la vista.
--
-- El arreglo: en la LECTURA, el permiso del cuadro se pregunta una sola
-- vez por consulta. Un `(select f())` sin referencias a la fila es un
-- InitPlan para el planificador: se evalúa una vez, no por fila. Es
-- equivalente en seguridad porque toda fila de estos módulos tiene
-- area_id = area_modulo('calidad') (lo imponen los with check); la rama
-- del asesor (sus propias evaluaciones publicadas) queda igual.
-- =====================================================================

drop policy if exists calidad_evaluaciones_select on calidad_evaluaciones;
create policy calidad_evaluaciones_select on calidad_evaluaciones
  for select to authenticated
  using (
    (select public.nivel_en_area(public.area_modulo('calidad'))) is not null
    or public.calidad_es_mi_evaluacion(id)
  );

drop policy if exists calidad_respuestas_select on calidad_respuestas;
create policy calidad_respuestas_select on calidad_respuestas
  for select to authenticated
  using (
    (select public.nivel_en_area(public.area_modulo('calidad'))) is not null
    or public.calidad_es_mi_evaluacion(evaluacion_id)
  );

drop policy if exists calidad_retro_select on calidad_retroalimentaciones;
create policy calidad_retro_select on calidad_retroalimentaciones
  for select to authenticated
  using (
    (select public.nivel_en_area(public.area_modulo('calidad'))) is not null
    or public.calidad_es_mi_evaluacion(evaluacion_id)
  );

drop policy if exists calidad_compromisos_select on calidad_compromisos;
create policy calidad_compromisos_select on calidad_compromisos
  for select to authenticated
  using (
    (select public.nivel_en_area(public.area_modulo('calidad'))) is not null
    or exists (
      select 1 from calidad_retroalimentaciones rt
       where rt.id = retro_id and public.calidad_es_mi_evaluacion(rt.evaluacion_id)
    )
  );

drop policy if exists calidad_asesores_select on calidad_asesores;
create policy calidad_asesores_select on calidad_asesores
  for select to authenticated
  using (
    (select public.nivel_en_area(public.area_modulo('calidad'))) is not null
    or usuario_id = (select auth.uid())
  );
