-- =====================================================================
-- CALIDAD: LA POLÍTICA DE ESCRITURA DE RESPUESTAS NO FRENA LA LECTURA
-- =====================================================================
-- calidad_respuestas_write estaba declarada FOR ALL. En Postgres, el USING
-- de una política FOR ALL también participa en los SELECT (las políticas
-- del mismo comando se combinan con OR), así que cada lectura de la vista
-- evaluaba su EXISTS —con nivel_en_area() y soy_admin() dentro— una vez
-- por cada una de las ~15.700 respuestas: ahí estaba el statement timeout
-- del dashboard con «mes: todo».
--
-- Se divide en INSERT / UPDATE / DELETE con las mismas condiciones de la
-- 016 (sin cambio de semántica de escritura): la lectura queda solo con
-- calidad_respuestas_select, que ya se evalúa una vez por consulta (027).
-- =====================================================================

drop policy if exists calidad_respuestas_write on calidad_respuestas;

create policy calidad_respuestas_insert on calidad_respuestas
  for insert to authenticated
  with check (exists (
    select 1 from calidad_evaluaciones e
     where e.id = evaluacion_id
       and public.nivel_en_area(e.area_id) >= 'edicion'
       and (e.estado = 'borrador' or public.soy_admin())
  ));

create policy calidad_respuestas_update on calidad_respuestas
  for update to authenticated
  using (exists (
    select 1 from calidad_evaluaciones e
     where e.id = evaluacion_id
       and public.nivel_en_area(e.area_id) >= 'edicion'
       and (e.estado = 'borrador' or public.soy_admin())
  ))
  with check (exists (
    select 1 from calidad_evaluaciones e
     where e.id = evaluacion_id
       and public.nivel_en_area(e.area_id) >= 'edicion'
       and (e.estado = 'borrador' or public.soy_admin())
  ));

create policy calidad_respuestas_delete on calidad_respuestas
  for delete to authenticated
  using (exists (
    select 1 from calidad_evaluaciones e
     where e.id = evaluacion_id
       and public.nivel_en_area(e.area_id) >= 'edicion'
       and (e.estado = 'borrador' or public.soy_admin())
  ));
