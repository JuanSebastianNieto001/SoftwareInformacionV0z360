-- =====================================================================
-- ENDURECIMIENTO TRAS LOS MÓDULOS DE EVALUACIÓN Y CUMPLEAÑOS
-- =====================================================================
-- Revisión de seguridad del 5 de octubre de 2026 sobre lo añadido en las
-- migraciones 012 a 014. Tres cierres pequeños y uno de limpieza.
-- =====================================================================

-- ---------- 1. NOTIFICACIONES: SOLO SE MARCAN COMO LEÍDAS ----------
-- La política de update limitaba a las filas propias, pero dentro de ellas
-- cualquier columna era modificable: una persona podía reescribirse el
-- título o la clave de idempotencia de sus avisos. Es inofensivo para los
-- demás, pero un registro generado por el sistema no debería poder
-- editarse. Con el privilegio a nivel de columna, `leida_en` es lo único
-- que acepta un update, venga de donde venga.
revoke update on notificaciones from authenticated;
grant update (leida_en) on notificaciones to authenticated;

-- ---------- 2. INTENTOS DE LOGIN: SIN ACCESO DIRECTO ----------
-- La tabla ya estaba cerrada por RLS sin políticas; retirar también el
-- privilegio de tabla es defensa en profundidad: aunque alguien añadiera
-- una política por error, el rol seguiría sin poder tocarla. Las funciones
-- SECURITY DEFINER que la usan no dependen de estos privilegios.
revoke all on intentos_login from anon, authenticated;

-- ---------- 3. EL CARGO DE UNA EVALUACIÓN NO CAMBIA UNA VEZ CALIFICADA ----------
-- El disparador de coherencia comprueba cada calificación contra el cargo
-- de su evaluación, pero no al revés: cambiando cargo_id después de
-- calificar quedaban notas de criterios de otro cargo. La pantalla no lo
-- permite; la base tampoco debe.
create or replace function public.evaluacion_cargo_inmutable()
returns trigger language plpgsql as $$
begin
  if new.cargo_id <> old.cargo_id
     and exists (select 1 from evaluacion_calificaciones k where k.evaluacion_id = old.id) then
    raise exception 'No se puede cambiar el cargo de una evaluación que ya tiene calificaciones';
  end if;
  return new;
end $$;

drop trigger if exists trg_evaluaciones_cargo on evaluaciones;
create trigger trg_evaluaciones_cargo
  before update of cargo_id on evaluaciones
  for each row execute function public.evaluacion_cargo_inmutable();

-- ---------- 4. UNA SOLA FORMA DE LOCALIZAR UN MÓDULO ----------
-- area_evaluacion() nació antes que area_modulo(). Se conserva por
-- compatibilidad con lo que ya la llama, pero delega: una única definición
-- de "el área de un módulo".
create or replace function public.area_evaluacion()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select public.area_modulo('evaluacion')
$$;
