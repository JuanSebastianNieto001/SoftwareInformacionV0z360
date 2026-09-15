-- =====================================================================
-- ESTADOS DEL BUZÓN: de cinco a cuatro
-- =====================================================================
-- 'en_analisis' y 'en_accion' venían del ciclo formal del 10.2, pero en la
-- operación real quien gestiona no distingue entre "lo estoy mirando" y
-- "estoy actuando": pulsa Gestionar y el caso queda en curso. Dos estados
-- que nadie sabe separar se llenan al azar, y un campo así no sirve para
-- medir nada. Se funden en 'en_proceso'.
--
-- El detalle del ciclo no se pierde: sigue en analisis_causa, accion_tomada
-- y eficacia_verificada, que son texto y fechas, no un estado.
-- =====================================================================

-- Los tres CHECK comparan contra el enum, así que estorban al cambiar el
-- tipo. Se recrean idénticos al final.
alter table sugerencias drop constraint cierre_documentado;
alter table sugerencias drop constraint causa_en_incumplimientos;
alter table sugerencias drop constraint rechazo_justificado;

alter type estado_sugerencia rename to estado_sugerencia_viejo;

create type estado_sugerencia as enum (
  'recibida',
  'en_proceso',
  'cerrada',
  'rechazada'
);

alter table sugerencias
  alter column estado drop default,
  alter column estado type estado_sugerencia using (
    case estado::text
      when 'en_analisis' then 'en_proceso'
      when 'en_accion'   then 'en_proceso'
      else estado::text
    end::estado_sugerencia
  ),
  alter column estado set default 'recibida';

drop type estado_sugerencia_viejo;

alter table sugerencias add constraint cierre_documentado check (
  estado <> 'cerrada'
  or (accion_tomada is not null and evidencia_path is not null)
);

alter table sugerencias add constraint causa_en_incumplimientos check (
  estado <> 'cerrada'
  or tipo not in ('queja', 'no_conformidad')
  or analisis_causa is not null
);

-- Rechazar exige motivo escrito: es lo que se consulta despues para saber
-- por que se desecho un caso.
alter table sugerencias add constraint rechazo_justificado check (
  estado <> 'rechazada' or respuesta_emisor is not null
);
