-- =====================================================================
-- CALIDAD: LA NOTA QUE TRAÍA EL FORMULARIO ANTERIOR
-- =====================================================================
-- Las 535 auditorías históricas se cargaron desde el Google Forms. Allí la
-- nota salía de pesos por ítem que no están documentados (la matriz con los
-- pesos no estaba compartida), y al recalcularlas con pesos iguales solo
-- 60 de 531 coinciden. Para no perder la continuidad del ranking mientras
-- Calidad fija los pesos reales en la pauta, se conserva la nota original
-- en su propia columna. Las auditorías nuevas la dejan en null.
alter table calidad_evaluaciones
  add column if not exists nota_importada numeric(5,2) check (nota_importada between 0 and 100);

comment on column calidad_evaluaciones.nota_importada is
  'Nota final que traía el formulario anterior en las auditorías importadas. Null en las hechas en el sistema.';

-- La vista usa e.*, que quedó expandido al crearla: se recrea.
drop view if exists v_calidad_evaluaciones;
create view v_calidad_evaluaciones with (security_invoker = true) as
select e.*,
       m.nombre            as matriz_nombre,
       m.nota_minima,
       m.error_fatal_anula,
       t.n_items,
       t.n_respondidos,
       t.n_no_cumple,
       t.n_fatales_fallados,
       t.nota_sin_ic,
       case
         when t.nota_sin_ic is null then null
         when m.error_fatal_anula and t.n_fatales_fallados > 0 then 0
         else t.nota_sin_ic
       end as nota_final,
       case
         when t.nota_sin_ic is null then null
         when m.error_fatal_anula and t.n_fatales_fallados > 0 then false
         else t.nota_sin_ic >= m.nota_minima
       end as aprobada,
       rt.id     as retro_id,
       rt.estado as retro_estado
  from calidad_evaluaciones e
  join calidad_matrices m on m.id = e.matriz_id
  left join calidad_retroalimentaciones rt on rt.evaluacion_id = e.id
  cross join lateral (
    select count(i.id) filter (where i.activo)                                            as n_items,
           count(r.item_id)                                                                as n_respondidos,
           count(*) filter (where r.resultado = 'no_cumple')                               as n_no_cumple,
           count(*) filter (where r.resultado = 'no_cumple' and i.es_fatal)                as n_fatales_fallados,
           case when sum(i.peso) filter (where not i.es_fatal and r.resultado <> 'no_aplica') > 0
                then round(100 * sum(i.peso) filter (where not i.es_fatal and r.resultado = 'cumple')
                           / sum(i.peso) filter (where not i.es_fatal and r.resultado <> 'no_aplica'), 2)
           end                                                                             as nota_sin_ic
      from calidad_items i
      left join calidad_respuestas r on r.item_id = i.id and r.evaluacion_id = e.id
     where i.matriz_id = e.matriz_id
  ) t;
