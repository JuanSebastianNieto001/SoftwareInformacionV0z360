-- =====================================================================
-- MATRIZ 360: CARGO DE QUIEN EVALÚA
-- =====================================================================
-- En la hoja "Evaluaciones" del Excel, la columna D se titula "Cargo
-- Evaluado" pero lo que contiene es el cargo del EVALUADOR: en las filas
-- reales el evaluado es siempre el mismo team leader y en D aparecen
-- "Gerente General", "Gerente de Talento Humano", "Asesor"… según quién
-- firma la fila. Es un dato útil para leer el 360 (quién opina desde
-- dónde) y se conserva en su propia columna, sin mezclarlo con cargo_id,
-- que sigue siendo el cargo de la persona evaluada.
-- =====================================================================

alter table evaluacion_360_respuestas
  add column if not exists evaluador_cargo text;

-- La vista se recrea porque `r.*` quedó expandido al crearla y una columna
-- nueva en medio no se puede añadir con "create or replace".
drop view if exists v_evaluacion_360;
create view v_evaluacion_360 with (security_invoker = true) as
select r.*,
       c.nombre as cargo_nombre,
       (r.p1 + r.p2 + r.p3 + r.p4 + r.p5 + r.p6 + r.p7 + r.p8 + r.p9 + r.p10 + r.p11 + r.p12) / 12 as promedio,
       (r.p1 + r.p2 + r.p3)    / 3 as liderazgo,
       (r.p4 + r.p5 + r.p6)    / 3 as trabajo_equipo,
       (r.p7 + r.p8 + r.p9)    / 3 as calidad_resultados,
       (r.p10 + r.p11 + r.p12) / 3 as adaptabilidad
  from evaluacion_360_respuestas r
  join evaluacion_cargos c on c.id = r.cargo_id;

comment on column evaluacion_360_respuestas.evaluador_cargo is
  'Cargo de quien responde (columna D de la hoja "Evaluaciones"). El cargo de la persona evaluada es cargo_id.';
