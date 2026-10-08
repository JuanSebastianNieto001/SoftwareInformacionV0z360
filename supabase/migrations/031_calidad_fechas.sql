-- =====================================================================
-- CALIDAD: FECHA DE INTERACCIÓN AUTOMÁTICA, FECHA DE AUDITORÍA DEL AUDITOR
-- =====================================================================
-- Indicación de Calidad:
--   - «Interacción» la pone el sistema: la fecha (Colombia) en que se
--     registra la auditoría, esté en borrador o publicada, y no se cambia.
--   - «Auditoría» la ajusta la persona que audita (o un administrador),
--     también después de publicar.
-- Las 535 auditorías importadas conservan sus fechas: el disparador solo
-- actúa sobre lo que se crea o se edita desde ahora.
-- =====================================================================

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
     and not (coalesce(old.analista_id = auth.uid(), false) or public.soy_admin()) then
    raise exception 'Solo quien hizo la auditoría puede cambiar su fecha';
  end if;
  return new;
end $$;

create trigger trg_calidad_fechas
  before insert or update on calidad_evaluaciones
  for each row execute function public.calidad_fechas();

comment on column calidad_evaluaciones.fecha_interaccion is
  'Automática: la fecha (Colombia) en que se registró la auditoría. No se edita.';
comment on column calidad_evaluaciones.fecha_auditoria is
  'La fija quien audita; la puede ajustar esa persona (o un administrador) también después de publicar.';
