-- =====================================================================
-- FEEDBACK: EL COMPROMISO LO ESCRIBE EL COLABORADOR AL FIRMAR
-- =====================================================================
-- Cambio de flujo pedido por Calidad:
--   - Quien registra el feedback YA NO escribe el plan de acción.
--   - El colaborador, en «Mis feedback», escribe SU compromiso y firma.
--     El compromiso es obligatorio para firmar, salvo dos casos: un
--     reconocimiento positivo (no hay nada que corregir) o un rechazo en
--     disputa (no se compromete con lo que no acepta).
--   - Calidad ve «pendiente» hasta que llegan compromiso y firma, y
--     recibe la alerta en la campana cuando el colaborador firma.
-- La columna plan_accion se conserva: ahora la llena la firma.
-- =====================================================================

-- ---------- 1. LA FIRMA EXIGE EL COMPROMISO ----------
drop function if exists public.responder_feedback(uuid, text, text);

create or replace function public.responder_feedback(
  p_id uuid,
  p_conformidad text,
  p_comentario text default null,
  p_compromiso text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  f record;
  area uuid := public.area_modulo('feedback');
begin
  select x.id, x.colaborador_usuario_id, x.plan_accion, c.es_positivo
    into f
    from feedback x
    join feedback_catalogo c on c.id = x.catalogo_id
   where x.id = p_id;
  if f.id is null then raise exception 'No existe el feedback'; end if;
  if p_conformidad not in ('aceptado', 'observaciones', 'rechazado') then
    raise exception 'Conformidad inválida';
  end if;
  -- Puede firmar el colaborador vinculado, o quien edita el cuadro cuando la
  -- respuesta se dio en persona. coalesce: un NULL no deja pasar.
  if not (coalesce(f.colaborador_usuario_id = yo, false) or coalesce(public.nivel_en_area(area) >= 'edicion', false)) then
    raise exception 'No puedes responder este feedback';
  end if;
  -- El compromiso es obligatorio al aceptar un feedback que no es un
  -- reconocimiento. Vale el que llega ahora o uno ya registrado antes.
  if not coalesce(f.es_positivo, false)
     and p_conformidad <> 'rechazado'
     and coalesce(nullif(trim(p_compromiso), ''), f.plan_accion) is null then
    raise exception 'Escribe tu compromiso de mejora antes de firmar';
  end if;

  update feedback
     set conformidad = p_conformidad::feedback_conformidad,
         conformidad_comentario = nullif(trim(p_comentario), ''),
         conformidad_en = now(),
         plan_accion = coalesce(nullif(trim(p_compromiso), ''), plan_accion),
         -- Un rechazo abre disputa (reactiva el seguimiento); el resto no cambia el estado.
         estado = case when p_conformidad = 'rechazado' and estado = 'cerrado' then 'en_seguimiento' else estado end
   where id = p_id;

  insert into accesos (usuario_id, usuario_email, usuario_nombre, doc_titulo, area_nombre, accion)
  select yo, coalesce(u.email, ''), coalesce(p.nombre, ''),
         'Firma de feedback ' || p_id::text || ' (' || p_conformidad || case when nullif(trim(p_compromiso), '') is not null then ', con compromiso' else '' end || ')',
         'Retroalimentación', 'editar'
    from perfiles p left join auth.users u on u.id = p.id where p.id = yo;
end $$;
grant execute on function public.responder_feedback(uuid, text, text, text) to authenticated;

-- ---------- 2. ALERTAS: A CALIDAD CUANDO EL COLABORADOR FIRMA ----------
create or replace function public.generar_alertas_feedback()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  area uuid := public.area_modulo('feedback');
  pendientes integer;
begin
  if yo is null or area is null then return 0; end if;

  -- Como colaborador: feedback dirigido a mí, pendiente de mi compromiso y firma.
  insert into notificaciones (usuario_id, clave, tipo, titulo, cuerpo, enlace)
  select yo, 'feedback:conf:' || f.id, 'feedback',
         case when c.es_positivo then '🌟 Reconocimiento: ' else '✍️ Feedback por firmar: ' end || c.subtipo,
         left(f.descripcion, 110) || ' · deja tu compromiso y fírmalo en Mis feedback',
         '/mis-feedback'
    from feedback f
    join feedback_catalogo c on c.id = f.catalogo_id
   where f.colaborador_usuario_id = yo and f.conformidad is null
  on conflict (usuario_id, clave) do nothing;

  if public.nivel_en_area(area) is not null then
    -- Como gestor del cuadro: el colaborador dejó su compromiso y firmó.
    insert into notificaciones (usuario_id, clave, tipo, titulo, cuerpo, enlace)
    select yo, 'feedback:firma:' || f.id, 'feedback',
           case when f.conformidad = 'rechazado' then '⚠️ Feedback en disputa: ' else '✍️ Compromiso y firma: ' end || f.colaborador_nombre,
           c.subtipo || coalesce(' · «' || left(f.plan_accion, 90) || '»', '') ||
             coalesce(' · ' || left(f.conformidad_comentario, 90), ''),
           '/feedback/' || f.id
      from feedback f
      join feedback_catalogo c on c.id = f.catalogo_id
     where f.conformidad is not null
       -- Quien firmó no necesita el aviso de su propia firma.
       and (f.colaborador_usuario_id is null or f.colaborador_usuario_id <> yo)
    on conflict (usuario_id, clave) do nothing;

    -- Seguimientos por vencer o vencidos.
    insert into notificaciones (usuario_id, clave, tipo, titulo, cuerpo, enlace)
    select yo, 'feedback:vence:' || f.id || ':' || to_char(f.fecha_seguimiento, 'YYYY-MM-DD'), 'feedback',
           case when f.fecha_seguimiento < current_date then '⏰ Seguimiento vencido: ' else '⏰ Seguimiento por vencer: ' end || f.colaborador_nombre,
           c.subtipo || ' · ' || to_char(f.fecha_seguimiento, 'DD/MM/YYYY'),
           '/feedback/' || f.id
      from feedback f
      join feedback_catalogo c on c.id = f.catalogo_id
     where f.estado in ('abierto', 'en_seguimiento')
       and f.fecha_seguimiento is not null
       and f.fecha_seguimiento <= current_date + 2
    on conflict (usuario_id, clave) do nothing;
  end if;

  select count(*) into pendientes from notificaciones where usuario_id = yo and leida_en is null;
  return pendientes;
end $$;
grant execute on function public.generar_alertas_feedback() to authenticated;

comment on column feedback.plan_accion is
  'Compromiso del colaborador: lo escribe él al firmar (responder_feedback). Obligatorio salvo reconocimientos y rechazos.';
