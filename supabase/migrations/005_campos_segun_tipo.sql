-- =====================================================================
-- EL FORMULARIO DEL BUZÓN SE ADAPTA AL TIPO DE REGISTRO
-- =====================================================================
-- Hasta ahora `impacto` era obligatorio para los cinco tipos, así que una
-- felicitación tenía que declarar "a quién afecta". Quien rellena eso a la
-- fuerza escribe cualquier cosa, y ese relleno acaba en el análisis del
-- 9.1.3 como si fuera un dato.
--
-- La regla pasa a depender del tipo:
--   · queja y no conformidad  -> el impacto es obligatorio (sin él no hay
--                                evidencia de qué se dañó)
--   · sugerencia y oportunidad de mejora -> la propuesta es obligatoria
--                                (una sugerencia sin propuesta no propone)
--   · felicitación            -> solo el relato
--
-- Se hace con CHECK y no solo en la aplicación por lo mismo que el resto de
-- reglas del buzón: el formulario puede cambiar, la fila tiene que seguir
-- siendo válida como evidencia.
-- =====================================================================

alter table sugerencias alter column impacto drop not null;

alter table sugerencias
  add constraint impacto_cuando_aplica check (
    tipo not in ('queja', 'no_conformidad') or impacto is not null
  );

alter table sugerencias
  add constraint propuesta_cuando_aplica check (
    tipo not in ('sugerencia', 'oportunidad_mejora') or propuesta is not null
  );

comment on column sugerencias.impacto is
  'A quién o a qué afecta. Obligatorio en queja y no conformidad; NULL en el resto.';
comment on column sugerencias.propuesta is
  'Propuesta del emisor. Obligatoria en sugerencia y oportunidad de mejora.';
